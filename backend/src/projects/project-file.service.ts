import { Injectable, NotFoundException } from '@nestjs/common';
import { aLaPermission } from '../commun/permission.guard';
import { ROLE_CTO, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import type { Temps } from '../reglages/gabarit';
import { refDevis, statutDevisEffectif } from '../devis/domaine';
import { dateOfDay, workdayRank } from './work-calendar';
import { invoiceWaits } from './task-states';
import { deliveryDate, projectHorizon, type DecisionContext } from './decision-context';
import { actsAsDplg, canDecide, canQualify, canVisa, outsideCircuit, projectScope } from './review-rules';
import {
  fullName,
  grantedExtension,
  isoDay,
  pendingExtension,
  siteStatus,
  trancheStatus,
  TS_UNITS,
  WITH_TASKS,
  type Actor,
} from './project-query';
import { ProjectStatesService } from './project-states.service';
import { submissionBaseName } from './submission-file-name';

type Chief = {
  id: string;
  prenom: string;
  nom: string;
  utilisateur: { actif: boolean } | null;
  dossierPersonnel: { utilisateur: { actif: boolean } | null } | null;
} | null;

// Validation (maquette) : sans temps atelier, le dépôt du justificatif vaut
// validation ; sinon le chef d’équipe, et l'Architecte DPLG quand la tâche est
// celle du chef d’équipe. Noms : les comptes réellement prévenus (même circuit
// que les notifications), le signataire des contrats à défaut. `motif`
// (pourquoi pas le chef) n'est affiché qu'aux gestionnaires.
function reviewerOf(
  temps: Temps,
  assigneId: string | null,
  ctx: DecisionContext,
  chief: Chief,
  names: { dplg: string | null; cto: string | null },
) {
  if (temps.type === 'sans') return { mode: 'depot' as const };
  if (assigneId && ctx.dplgEmployees.has(assigneId))
    return { mode: 'personne' as const, nom: names.cto, role: 'CTO', motif: 'travail du Dir. GC' };
  if (
    chief &&
    assigneId !== chief.id &&
    (ctx.absentEmployees.has(chief.id) || (!chief.utilisateur?.actif && !chief.dossierPersonnel?.utilisateur?.actif))
  )
    // Chef sans compte HUB ou absent : la remise remonte à l'Architecte DPLG.
    return {
      mode: 'personne' as const,
      nom: names.dplg,
      role: 'Architecte DPLG',
      motif: `${fullName(chief)} ${ctx.absentEmployees.has(chief.id) ? 'absent' : 'sans compte HUB'}`,
    };
  if (chief && assigneId === chief.id)
    return { mode: 'personne' as const, nom: names.dplg, role: 'Architecte DPLG', motif: 'tâche du chef d’équipe' };
  return { mode: 'personne' as const, nom: fullName(chief), role: 'chef d’équipe' };
}

// Dossier d'un projet ouvert (maquette « Projets » du boss) : étapes, cartes,
// tâches et leurs états du jour, et ce que la personne connectée peut y faire.
@Injectable()
export class ProjectFileService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private states: ProjectStatesService,
  ) {}

  async file(companyId: string, projectId: string, actor: Actor & { permissions?: Record<string, string> }) {
    const { decider, ctx } = await this.states.decider(companyId, actor);
    const p = await this.prisma.projet.findFirst({
      where: {
        id: projectId,
        societeId: companyId,
        ouvertLe: { not: null },
        ...projectScope(actor.role, decider.employeeId),
      },
      include: {
        ...WITH_TASKS,
        client: { select: { nom: true, type: true } },
        cellules: {
          include: {
            cellule: {
              include: {
                dispatcher: {
                  select: {
                    id: true,
                    prenom: true,
                    nom: true,
                    utilisateur: { select: { actif: true } },
                    dossierPersonnel: { select: { utilisateur: { select: { actif: true } } } },
                  },
                },
              },
            },
          },
        },
        gabaritVersion: { select: { code: true, libelle: true } },
        factures: { where: { estAvoir: false, statut: { not: 'annulee' } }, select: { jalon: true, statut: true } },
        devis: {
          where: { statut: 'transforme' },
          select: { numero: true, dateEnvoi: true, codeDossier: true, rangDossier: true },
          take: 1,
        },
        societe: { select: { contratSignataireNom: true } },
      },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const holidays = await this.states.holidays(companyId);
    const today = todayIso();
    const { etapes, cardStates, taskStates } = this.states.states(p, today, holidays);
    const cell = p.cellules[0]?.cellule ?? null;
    const chief = cell?.dispatcher ?? null;
    // « Ajouter en TS » : l'Architecte DPLG (ou son suppléant) et le CTO.
    const dplgConnected = actsAsDplg(decider) || actor.role === ROLE_CTO;
    const deliveryOn = deliveryDate(p, holidays);
    // Remise et demande de prolongation : jamais pour un rôle hors circuit (CEO).
    const inCircuit = !outsideCircuit(actor.role);
    const dplg = p.societe.contratSignataireNom?.trim() || null;
    const pilot = await this.reglages.regle<string>(companyId, 'pilote_etudes');
    const horizon = projectHorizon(p.budgetHeures);
    // Nombre de messages par fil (« Fil de la carte · N », bulle d'une tâche).
    const threads = await this.prisma.commentaireProjet.groupBy({
      by: ['carteId', 'tacheId'],
      where: { projetId: p.id },
      _count: true,
    });
    // Auteurs des visas DPLG apposés (nom affiché sous la tâche).
    const viewers = new Map(
      (
        await this.prisma.utilisateur.findMany({
          where: {
            id: { in: p.cartes.flatMap((c) => c.taches.map((t) => t.visaParId)).filter((x): x is string => !!x) },
          },
          select: { id: true, prenom: true, nom: true },
        })
      ).map((u) => [u.id, fullName(u)]),
    );
    const threadOf = (carteId: string, tacheId: string | null) =>
      threads.find((f) => f.carteId === carteId && f.tacheId === tacheId)?._count ?? 0;
    const names = {
      dplg: (await this.states.accountNames(ctx.dplgAccounts)) ?? dplg,
      cto: await this.states.accountNames(ctx.ctoAccounts),
    };
    const me = decider.employeeId;

    return {
      id: p.id,
      code: p.code,
      client: { nom: p.client.nom, type: p.client.type },
      cellule: cell ? { nom: cell.nom, chef: fullName(chief) } : null,
      // La personne connectée pilote la cellule du projet (elle valide).
      jeSuisChef: !!chief && !!me && chief.id === me,
      pilote: pilot === 'head_of_engineering' ? 'Head of Engineering (à recruter)' : (dplg ?? 'Architecte DPLG'),
      version: p.gabaritVersion,
      offre: p.devis[0] ? refDevis(p.devis[0]) : null,
      ouvertLe: p.ouvertLe,
      livraisonLe: dateOfDay(p.ouvertLe!, horizon, holidays),
      jour: workdayRank(p.ouvertLe!, today, holidays),
      horizon,
      budgetHeures: p.budgetHeures,
      dateVisiteSite: p.dateVisiteSite,
      statutChantier: siteStatus(p.phase),
      factures: {
        F1: trancheStatus(p.factures, 'F1'),
        F2: trancheStatus(p.factures, 'F2'),
        F3: trancheStatus(p.factures, 'F3'),
      },
      // Toutes les équipes du projet (la première porte le chef qui valide).
      equipes: p.cellules.map((c) => ({ nom: c.cellule.nom, chef: fullName(c.cellule.dispatcher) })),
      // Assigner (même règle que TaskAssignmentService.scope) : l'écriture sur
      // Projets, le CTO seulement en suppléance d'un Dir. GC (revue CTO) ; ou
      // le chef d'une équipe du projet.
      peutAssigner:
        inCircuit &&
        ((aLaPermission(actor.permissions, 'projets', 'ecriture') && (actor.role !== ROLE_CTO || ctx.ctoStandsIn)) ||
          (!!me && p.cellules.some((c) => c.cellule.dispatcher?.id === me))),
      // « Ajouter en TS » (Architecte DPLG) : cartes « par unité » actives.
      optionsTs: dplgConnected
        ? p.cartes.flatMap((c) => {
            const t = c.temps as Temps | null;
            return t?.type === 'par_unite' && !c.desactivation
              ? [{ carteId: c.id, libelle: TS_UNITS[t.unite], heures: t.heures }]
              : [];
          })
        : [],
      attentes: invoiceWaits(etapes, this.states.cardSources(p)),
      etapes: etapes.map((e) => {
        const c = p.cartes.find((x) => x.etapeNumero === e.numero)!;
        return { ...e, cle: c.etapeCle, libelle: c.etapeLibelle };
      }),
      cartes: p.cartes.map((c) => ({
        id: c.id,
        etapeNumero: c.etapeNumero,
        etapeLibelle: c.etapeLibelle,
        cle: c.cle,
        libelle: c.libelle,
        note: c.note,
        descriptif: c.descriptif,
        etiquette: c.etiquette,
        debutJ: c.debutJ,
        finJ: c.finJ,
        debutLe: c.debutLe,
        finLe: c.finLe,
        temps: c.temps as Temps | null,
        client: c.client,
        fichiers: c.fichiers,
        fil: threadOf(c.id, null),
        etat: cardStates.get(c.id)!,
        taches: c.taches.map((t) => {
          const pending = pendingExtension(t.prolongations);
          return {
            id: t.id,
            cle: t.cle,
            libelle: t.libelle,
            descriptif: t.descriptif,
            sourceNative: t.sourceNative,
            fichierObligatoire: t.fichierObligatoire,
            debutJ: t.debutJ,
            finJ: t.finJ,
            debutLe: t.debutLe,
            finLe: t.finLe,
            temps: t.temps as Temps,
            heures: t.heures === null ? null : Number(t.heures),
            statut: t.statut,
            motif: t.motif,
            version: t.version,
            // Fichiers de chaque remise (v01, v02…), sans leur contenu.
            pieces: t.pieces,
            // Élément TS : devis d'avenant qui le facture et son état.
            avenant: t.devisTs
              ? { devisId: t.devisTs.id, reference: refDevis(t.devisTs), statut: statutDevisEffectif(t.devisTs, today) }
              : null,
            valideeLe: isoDay(t.valideeLe),
            valideePar: fullName(t.valideePar),
            // Visa DPLG exigé : apposé le… par… (null tant qu'il ne l'est pas).
            visa: t.visaRequis
              ? {
                  le: isoDay(t.visaLe),
                  par: t.visaParId ? (viewers.get(t.visaParId) ?? null) : null,
                  nonTrace: t.visaNonTrace,
                }
              : null,
            // L'architecte DPLG (Dir. GC, ou un autre Dir. GC en suppléance —
            // jamais le CTO : le visa engage la signature de l'architecte).
            peutViser: canVisa(actor.role) && t.statut === 'validee' && t.visaRequis && !t.visaLe && !t.visaNonTrace,
            assigne: t.assigne
              ? { id: t.assigne.id, nom: fullName(t.assigne)!, cellule: t.assigne.cellule?.nom ?? null }
              : null,
            // Assignée à la personne connectée (« Seulement mes tâches »).
            aMoi: !!me && t.assigneId === me,
            validation: reviewerOf(t.temps as Temps, t.assigneId, ctx, chief, names),
            peutDecider: canDecide(decider, this.states.ruleFor(ctx, t), chief?.id ?? null),
            prolongation: {
              enAttente: pending
                ? { jusquau: pending.jusquau, motif: pending.motif, le: isoDay(pending.demandeLe) }
                : null,
              accordeeJusquau: grantedExtension(t.prolongations),
            },
            // Prolongation : l'assigné la demande (tâche ni validée ni « non
            // nécessaire », aucune demande en attente) ; chef d’équipe ou DPLG décide.
            peutDemanderProlongation:
              inCircuit &&
              !!me &&
              t.assigneId === me &&
              !['validee', 'non_necessaire'].includes(t.statut) &&
              !c.desactivation &&
              !pending,
            peutDeciderProlongation:
              !!pending &&
              canQualify(
                decider,
                this.states.ruleFor(ctx, t),
                chief?.id ?? null,
                !!deliveryOn && pending.jusquau > deliveryOn,
              ),
            // Remise par la personne assignée, carte ouverte (ni désactivée ni verrouillée).
            peutRemettre:
              inCircuit &&
              !!me &&
              t.assigneId === me &&
              (t.statut === 'a_faire' || t.statut === 'reprise') &&
              cardStates.get(c.id)!.code === 'ouverte',
            // Base du nom des fichiers du prochain dépôt (aperçu du formulaire).
            nomDepot: submissionBaseName({
              code: p.code,
              etapeNumero: c.etapeNumero,
              task: t.libelle,
              version: t.version + 1,
            }),
            fil: threadOf(c.id, t.id),
            etat: taskStates.get(t.id)!,
          };
        }),
      })),
    };
  }
}
