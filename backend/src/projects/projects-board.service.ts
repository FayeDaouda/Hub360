import { Injectable } from '@nestjs/common';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { alerteAvenant } from '../devis/domaine';
import { workdayRank } from './work-calendar';
import { isOpenComment } from './thread-rules';
import { deliveryDate, projectHorizon } from './decision-context';
import { canDecide, canQualify, canVisa, projectScope } from './review-rules';
import { chiefOf, pendingExtension, siteStatus, WITH_TASKS, type Actor } from './project-query';
import { ProjectStatesService } from './project-states.service';

// Page Projets : la liste des projets ouverts et ses tuiles, et « À décider ».
@Injectable()
export class ProjectsBoardService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private states: ProjectStatesService,
  ) {}

  async board(companyId: string, actor: Actor) {
    const { decider, ctx } = await this.states.decider(companyId, actor);
    const projects = await this.prisma.projet.findMany({
      where: {
        societeId: companyId,
        ouvertLe: { not: null },
        ...projectScope(actor.role, decider.employeeId),
      },
      orderBy: { ouvertLe: 'asc' },
      include: {
        ...WITH_TASKS,
        client: { select: { nom: true } },
        cellules: { include: { cellule: { select: { nom: true, dispatcherId: true } } } },
      },
    });
    const holidays = await this.states.holidays(companyId);
    const today = todayIso();
    const summaries = projects.map((p) => {
      const { etapes } = this.states.states(p, today, holidays);
      const sum = (key: 'faites' | 'total' | 'enRetard') => etapes.reduce((s, e) => s + e[key], 0);
      const day = workdayRank(p.ouvertLe!, today, holidays);
      const horizon = projectHorizon(p.budgetHeures);
      return {
        id: p.id,
        code: p.code,
        client: p.client.nom,
        cellule: p.cellules[0]?.cellule.nom ?? null,
        jour: day,
        horizon,
        faites: sum('faites'),
        total: sum('total'),
        enRetard: sum('enRetard'),
        // Jour de livraison franchi sans que le projet soit déclaré livré.
        livraisonDepassee: day > horizon && siteStatus(p.phase) !== 'livre',
      };
    });
    const tasks = projects.flatMap((p) => p.cartes.flatMap((c) => c.taches));
    return {
      // En-tête de la page : gabarit et budget atelier en service (Réglages).
      gabarit: 'GC-CONCEPTION',
      budgetHeures: await this.reglages.regle<number>(companyId, 'budget_atelier_heures'),
      projets: summaries,
      kpi: {
        remisesAValider: tasks.filter((t) => t.statut === 'a_valider').length,
        // Remises que la personne connectée peut trancher (jamais les siennes).
        aValiderParVous: projects.flatMap((p) =>
          p.cartes.flatMap((c) =>
            c.taches
              .filter((t) => canDecide(decider, this.states.ruleFor(ctx, t), chiefOf(p)))
              .map((t) => ({ projetId: p.id, tacheId: t.id })),
          ),
        ),
        tachesEnRetard: summaries.reduce((s, r) => s + r.enRetard, 0),
        // Demandes de prolongation en attente de décision (projets visibles).
        prolongations: tasks.filter((t) => pendingExtension(t.prolongations)).length,
        tsNonAcceptes: await this.unacceptedTs(
          companyId,
          projects.map((p) => p.id),
          today,
        ),
        mentions: await this.openMentions(projects.map((p) => p.id)),
      },
    };
  }

  // « À décider » (revue Dir. GC, 21/10/2026) : sur tous les projets visibles,
  // les remises et les demandes de prolongation que la personne connectée peut
  // trancher — mêmes règles que les boutons (canDecide, canQualify).
  async toDecide(companyId: string, actor: Actor) {
    const { decider, ctx } = await this.states.decider(companyId, actor);
    const holidays = await this.states.holidays(companyId);
    const projects = await this.prisma.projet.findMany({
      where: {
        societeId: companyId,
        ouvertLe: { not: null },
        ...projectScope(actor.role, decider.employeeId),
      },
      include: {
        ...WITH_TASKS,
        client: { select: { nom: true } },
        cellules: { include: { cellule: { select: { dispatcherId: true } } } },
      },
    });
    const rows = projects.flatMap((p) => {
      const chiefId = chiefOf(p);
      return p.cartes.flatMap((c) => c.taches.map((t) => ({ p, c, t, chiefId })));
    });
    const submissions = rows.filter(({ t, chiefId }) => canDecide(decider, this.states.ruleFor(ctx, t), chiefId));
    const extensions = rows
      .map((l) => {
        const request = pendingExtension(l.t.prolongations);
        const delivery = deliveryDate(l.p, holidays);
        return { ...l, request, pushesBack: !!request && !!delivery && request.jusquau > delivery, delivery };
      })
      .filter(
        ({ t, chiefId, request, pushesBack }) =>
          request && canQualify(decider, this.states.ruleFor(ctx, t), chiefId, pushesBack),
      );
    // Visas DPLG à apposer (l'architecte DPLG seul).
    const visas = canVisa(actor)
      ? rows.filter(({ t }) => t.statut === 'validee' && t.visaRequis && !t.visaLe && !t.visaNonTrace)
      : [];
    // Date de la dernière remise de chaque tâche à valider.
    const events = await this.prisma.evenementTacheProjet.findMany({
      where: { type: 'remise', tacheId: { in: submissions.map((r) => r.t.id) } },
      orderBy: { creeLe: 'desc' },
      select: { tacheId: true, creeLe: true },
    });
    const submittedAt = new Map<string, Date>();
    for (const e of events) if (!submittedAt.has(e.tacheId)) submittedAt.set(e.tacheId, e.creeLe);
    const common = ({ p, c, t }: (typeof rows)[number]) => ({
      projetId: p.id,
      code: p.code,
      client: p.client.nom,
      tacheId: t.id,
      tache: t.libelle,
      carte: c.libelle,
      assigne: t.assigne ? `${t.assigne.prenom} ${t.assigne.nom}`.trim() : null,
    });
    return {
      remises: submissions.map((l) => ({
        ...common(l),
        version: l.t.version,
        remiseLe: submittedAt.get(l.t.id) ?? null,
      })),
      prolongations: extensions.map((l) => ({
        ...common(l),
        jusquau: l.request!.jusquau,
        motif: l.request!.motif,
        demandeLe: l.request!.demandeLe,
        finPrevue: l.t.finLe,
        // Escalade au CTO : la nouvelle date dépasse la livraison du projet.
        repousseLivraison: l.pushesBack ? l.delivery : null,
      })),
      visas: visas.map((l) => ({ ...common(l), valideeLe: l.t.valideeLe })),
      // TS au-delà du seuil, demandés par le Dir. GC : au CTO de trancher.
      ts: await this.states.tsRequestsToDecide(
        companyId,
        decider,
        projects.map((p) => p.id),
      ),
    };
  }

  // Tâches (ou cartes) dont un commentaire attend la réponse d'une personne
  // mentionnée (tuile « Signalements et mentions » : « N tâche(s) »).
  private async openMentions(projectIds: string[]) {
    if (!projectIds.length) return 0;
    const roots = await this.prisma.commentaireProjet.findMany({
      where: { projetId: { in: projectIds }, parentId: null, mentions: { some: {} }, resoluLe: null },
      select: {
        carteId: true,
        tacheId: true,
        resoluLe: true,
        _count: { select: { reponses: true, mentions: true } },
      },
    });
    const open = roots.filter((r) => isOpenComment({ ...r, mentions: r._count.mentions, reponses: r._count.reponses }));
    return new Set(open.map((r) => r.tacheId ?? r.carteId)).size;
  }

  // Avenants (TS) envoyés et non acceptés au-delà du délai réglé.
  private async unacceptedTs(companyId: string, projectIds: string[], today: string) {
    if (!projectIds.length) return 0;
    const [threshold, quotes] = await Promise.all([
      this.reglages.regle<number>(companyId, 'alerte_avenant_jours'),
      this.prisma.devis.findMany({
        where: { societeId: companyId, projetId: { in: projectIds }, statut: 'envoye' },
        select: {
          projetId: true,
          statut: true,
          dateValidite: true,
          dateEnvoi: true,
          lignes: { select: { produitService: { select: { famille: true } } } },
        },
      }),
    ]);
    return quotes.filter((d) =>
      alerteAvenant({ ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) }, today, threshold),
    ).length;
  }
}
