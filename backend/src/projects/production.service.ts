import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, ROLE_CEO, ROLE_COMPANY_ADMIN, ROLE_CTO, ROLE_DIR_GC, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { dateOfDay, workdayRank } from './work-calendar';
import { workloadOver } from './workload';
import { invoiceWaits, type TaskState } from './task-states';
import { isDeliverySoon, projectHorizon } from './decision-context';
import {
  fullName,
  KEY_CARDS,
  pendingExtension,
  siteStatus,
  trancheStatus,
  WITH_TASKS,
  type Actor,
} from './project-query';
import { ProjectStatesService } from './project-states.service';

type Period = { debut: string; fin: string };
type LoadTask = { id: string; debutLe: string | null; finLe: string | null; heures: Prisma.Decimal | null };
const toLoad = (t: LoadTask) => ({
  id: t.id,
  debut: t.debutLe,
  echeance: t.finLe,
  heures: t.heures == null ? null : Number(t.heures),
});
// Tâches encore à faire qui touchent la période (les validées sont livrées).
const openTasksIn = (p: Period) => ({
  statut: { in: ['a_faire' as const, 'a_valider' as const, 'reprise' as const] },
  debutLe: { lte: p.fin },
  finLe: { gte: p.debut },
});
const absencesIn = (p: Period) => ({
  where: { statut: 'validee' as const, dateDebut: { lte: p.fin }, dateFin: { gte: p.debut } },
  select: { dateDebut: true, dateFin: true },
});

// Production et charge : le tableau de production de la direction, la charge
// des cellules, et la charge de chacun avant d'assigner une tâche.
@Injectable()
export class ProductionService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private states: ProjectStatesService,
  ) {}

  // Charge prévisionnelle de chaque personne assignable sur la fenêtre de la
  // tâche (avant d'assigner), et la zone normale fixée dans Réglages.
  // `cellIds` : seulement les membres de ces cellules (chef d'équipe).
  async workload(companyId: string, projectId: string, taskId: string, cellIds: string[] | null = null) {
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: { id: true, debutLe: true, finLe: true, heures: true },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    return this.workloadOf(companyId, [task], cellIds);
  }

  // Même charge, sur la fenêtre d'un bloc (du début de sa première tâche
  // ouverte à l'échéance de la dernière), ses tâches ouvertes comprises.
  async cardWorkload(companyId: string, projectId: string, cardId: string, cellIds: string[] | null = null) {
    const card = await this.prisma.carteProjet.findFirst({
      where: { id: cardId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        taches: {
          where: { statut: { notIn: ['validee', 'non_necessaire'] } },
          select: { id: true, debutLe: true, finLe: true, heures: true },
        },
      },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    return this.workloadOf(companyId, card.taches, cellIds);
  }

  private async workloadOf(companyId: string, tasks: LoadTask[], cellIds: string[] | null) {
    const zone = await this.reglages.regle<{ de: number; a: number } | null>(companyId, 'objectif_charge_equipes');
    const dated = tasks.filter((t) => t.debutLe && t.finLe && t.debutLe <= t.finLe);
    if (!dated.length) return { periode: null, zone, charges: [] };
    const p = {
      debut: dated.map((t) => t.debutLe!).reduce((a, b) => (a < b ? a : b)),
      fin: dated.map((t) => t.finLe!).reduce((a, b) => (a > b ? a : b)),
    };
    const ids = tasks.map((t) => t.id);
    const [employees, holidays] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId: companyId, ...(cellIds ? { celluleId: { in: cellIds } } : {}) },
        select: {
          id: true,
          tachesProjet: {
            where: { id: { notIn: ids }, ...openTasksIn(p) },
            select: { id: true, debutLe: true, finLe: true, heures: true },
          },
          dossierPersonnel: { select: { absences: absencesIn(p) } },
        },
      }),
      this.states.holidays(companyId),
    ]);
    return {
      periode: p,
      zone,
      charges: employees.map((c) => ({
        collaborateurId: c.id,
        ...workloadOver(
          p,
          c.tachesProjet.map(toLoad),
          dated.map(toLoad),
          (c.dossierPersonnel?.absences ?? []).map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
          holidays,
        ),
      })),
    };
  }

  // Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : un écran pour
  // le Dir. GC (les projets dont il porte le dossier), le CTO et le CEO (tous) —
  // avancement, calendrier, retards, décisions en attente, prochaine tranche,
  // charge des cellules sur deux semaines, échéances des 14 jours.
  async production(companyId: string, actor: Actor) {
    if (![ROLE_DIR_GC, ROLE_CTO, ROLE_CEO, ROLE_COMPANY_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Le tableau de production est réservé au Dir. GC, au CTO et au CEO.');
    }
    const today = todayIso();
    const holidays = await this.states.holidays(companyId);
    const projects = await this.prisma.projet.findMany({
      where: {
        societeId: companyId,
        ouvertLe: { not: null },
        ...(actor.role === ROLE_DIR_GC ? { dossierCrm: { proprietaireId: actor.userId } } : {}),
      },
      orderBy: { ouvertLe: 'asc' },
      include: {
        ...WITH_TASKS,
        client: { select: { nom: true } },
        cellules: { include: { cellule: { select: { code: true, nom: true } } } },
        factures: { where: { estAvoir: false, statut: { not: 'annulee' } }, select: { jalon: true, statut: true } },
      },
    });
    const ts = await this.prisma.demandeTs.groupBy({
      by: ['projetId'],
      where: { societeId: companyId, statut: 'a_valider', projetId: { in: projects.map((p) => p.id) } },
      _count: true,
    });
    const tsByProject = new Map(ts.map((t) => [t.projetId, t._count]));
    const inDays = (n: number) => addDays(today, n);

    const rows = projects.map((p) => {
      const { etapes, cardStates, taskStates } = this.states.states(p, today, holidays);
      const tasks = p.cartes.flatMap((c) => c.taches);
      const count = (code: TaskState['code']) => tasks.filter((t) => taskStates.get(t.id)?.code === code).length;
      const horizon = projectHorizon(p.budgetHeures);
      const deliveryOn = dateOfDay(p.ouvertLe!, horizon, holidays);
      const status = siteStatus(p.phase);
      // Étape en cours : la plus avancée où le travail a lieu (commencée,
      // terminée ou non) ; les tâches restées ouvertes dans une étape
      // antérieure sont signalées à part (« 1 tâche en souffrance dans
      // Onboard ») — revue Dir. GC, 21/10/2026.
      const stepLabel = (n: number) => p.cartes.find((c) => c.etapeNumero === n)?.etapeLibelle ?? '';
      const current = etapes.filter((e) => e.etat !== 'a_venir').at(-1) ?? etapes[0];
      const lagging = current
        ? etapes
            .filter((e) => e.numero < current.numero && e.total > e.faites)
            .map((e) => ({ numero: e.numero, libelle: stepLabel(e.numero), taches: e.total - e.faites }))
        : [];
      const waiting = invoiceWaits(etapes, this.states.cardSources(p));
      const next = (['F2', 'F3'] as const).find((f) => trancheStatus(p.factures, f) !== 'emise');
      const pendingDecisions = {
        remises: count('a_valider'),
        visas: count('a_viser'),
        prolongations: tasks.filter((t) => pendingExtension(t.prolongations)).length,
        ts: tsByProject.get(p.id) ?? 0,
      };
      const late = count('en_retard');
      const deliveryPassed = today > deliveryOn && status !== 'livre';
      // Livraison dans les 15 jours, projet pas encore livré (tuile et filtre).
      const deliverySoon = isDeliverySoon(status, deliveryOn, today);
      return {
        projet: { id: p.id, code: p.code, client: p.client.nom, cellule: p.cellules[0]?.cellule.nom ?? null },
        statutChantier: status,
        etape: current
          ? { numero: current.numero, libelle: stepLabel(current.numero), terminee: current.etat === 'terminee' }
          : null,
        souffrance: lagging,
        faites: etapes.reduce((s, e) => s + e.faites, 0),
        total: etapes.reduce((s, e) => s + e.total, 0),
        jour: workdayRank(p.ouvertLe!, today, holidays),
        horizon,
        livraisonLe: deliveryOn,
        livraisonDepassee: deliveryPassed,
        livraisonProche: deliverySoon,
        enRetard: late,
        prolongees: count('prolongee'),
        attente: pendingDecisions,
        // Prochaine tranche non émise : prête (rien n'attend) ou ce qu'elle attend.
        tranche: next ? { code: next, statut: trancheStatus(p.factures, next), attend: waiting[next] } : null,
        // Cartes clés dont la fenêtre se termine dans les 14 jours, pas encore closes.
        echeances: p.cartes
          .filter(
            (c) =>
              KEY_CARDS.includes(c.cle) &&
              c.finLe &&
              c.finLe >= today &&
              c.finLe <= inDays(14) &&
              !['close', 'desactivee'].includes(cardStates.get(c.id)!.code),
          )
          .map((c) => ({ carte: c.libelle, finLe: c.finLe! })),
        // Tri : livraison dépassée, retards, décisions en attente.
        risque: (deliveryPassed ? 1000 : 0) + late * 10 + Object.values(pendingDecisions).reduce((s, n) => s + n, 0),
      };
    });
    rows.sort((a, b) => b.risque - a.risque || a.livraisonLe.localeCompare(b.livraisonLe));

    const load = await this.cellWorkload(companyId, { debut: today, fin: inDays(13) }, holidays);
    const averages = load.cellules.map((c) => c.moyenne).filter((x): x is number => x !== null);
    return {
      perimetre: actor.role === ROLE_DIR_GC ? ('mes_projets' as const) : ('tous' as const),
      chiffres: {
        ouverts: rows.length,
        enRetard: rows.filter((l) => l.enRetard > 0 || l.livraisonDepassee).length,
        livraisons15: rows.filter((l) => l.livraisonProche).length,
        enAttente: rows.reduce((s, l) => s + Object.values(l.attente).reduce((t, n) => t + n, 0), 0),
        chargeMoyenne: averages.length ? Math.round(averages.reduce((s, x) => s + x, 0) / averages.length) : null,
      },
      lignes: rows.map(({ risque: _r, ...l }) => l),
      charge: load,
      // Livraisons dans les 14 jours (projets non livrés).
      livraisons: rows
        .filter((l) => l.statutChantier !== 'livre' && l.livraisonLe >= today && l.livraisonLe <= inDays(14))
        .map((l) => ({
          projetId: l.projet.id,
          code: l.projet.code,
          client: l.projet.client,
          livraisonLe: l.livraisonLe,
        })),
    };
  }

  // Charge de chaque personne des cellules sur la période (même calcul que
  // « Assigner » et l'indicateur « Charge des équipes »), par cellule.
  private async cellWorkload(companyId: string, p: Period, holidays: ReadonlySet<string>) {
    const [cells, zone] = await Promise.all([
      this.prisma.cellule.findMany({
        where: { societeId: companyId },
        orderBy: { code: 'asc' },
        select: {
          code: true,
          nom: true,
          membres: {
            orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
            select: {
              id: true,
              prenom: true,
              nom: true,
              tachesProjet: { where: openTasksIn(p), select: { id: true, debutLe: true, finLe: true, heures: true } },
              dossierPersonnel: { select: { absences: absencesIn(p) } },
            },
          },
        },
      }),
      this.reglages.regle<{ de: number; a: number } | null>(companyId, 'objectif_charge_equipes'),
    ]);
    const empty = { id: '_', debut: p.debut, echeance: p.fin, heures: 0 };
    return {
      periode: p,
      zone,
      cellules: cells
        .filter((c) => c.membres.length)
        .map((c) => {
          const members = c.membres.map((m) => {
            const load = workloadOver(
              p,
              m.tachesProjet.map(toLoad),
              empty,
              (m.dossierPersonnel?.absences ?? []).map((a) => ({ debut: a.dateDebut, fin: a.dateFin })),
              holidays,
            );
            return {
              id: m.id,
              nom: fullName(m)!,
              heures: load.assignees,
              disponibles: load.disponibles,
              pourcentage: load.pourcentage,
              joursAbsence: load.joursAbsence,
            };
          });
          const pcts = members.map((m) => m.pourcentage).filter((x): x is number => x !== null);
          return {
            code: c.code,
            nom: c.nom,
            membres: members,
            moyenne: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null,
          };
        }),
    };
  }
}
