import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatDate, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { contexteDecision } from '../projets/gabarit/suppleance';
import { collaborateurDuCompte, peutQualifier, verifierCircuit } from '../projets/gabarit/validation';
import { CHIEF_CELL, chiefOf, type Actor } from './project-query';
import { ReviewCircuitService } from './review-circuit.service';

// Prolongations d'une tâche : demandées par l'assigné, décidées par le chef de
// team, l'Architecte DPLG ou le CTO (livraison du projet repoussée, Dir. GC).
@Injectable()
export class TaskExtensionService {
  constructor(
    private prisma: PrismaService,
    private circuit: ReviewCircuitService,
  ) {}

  // Demande (assigné) : nouvelle date + motif. L'échéance de référence reste
  // figée (choix du 06/10/2026) : accordée, la prolongation qualifie le retard
  // jusqu'à cette date.
  async request(companyId: string, actor: Actor, projectId: string, taskId: string, until: string, reason: string) {
    verifierCircuit(actor.role);
    const task = await this.load(companyId, projectId, taskId);
    const employeeId = await collaborateurDuCompte(this.prisma, companyId, actor.userId);
    if (!employeeId || employeeId !== task.assigneId)
      throw new ForbiddenException('Seule la personne assignée demande une prolongation.');
    if (task.statut === 'validee' || task.statut === 'non_necessaire')
      throw new ConflictException('Tâche close : pas de prolongation.');
    if (task.carte.desactivation) throw new ConflictException('Carte désactivée : pas de prolongation.');
    if (task.prolongations.some((p) => p.decision === null))
      throw new ConflictException('Une demande de prolongation attend déjà une décision.');
    const floor = [task.finLe, task.prolongations.find((p) => p.decision === 'accordee')?.jusquau]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    if (floor && until <= floor)
      throw new BadRequestException(`La nouvelle date doit dépasser le ${formatDate(floor)}.`);

    await this.prisma.$transaction([
      this.prisma.prolongationTache.create({
        data: { tacheId: task.id, jusquau: until, motif: reason.trim(), demandeParId: actor.userId },
      }),
      this.prisma.evenementTacheProjet.create({
        data: {
          tacheId: task.id,
          type: 'prolongation',
          parId: actor.userId,
          detail: `Prolongation demandée jusqu’au ${formatDate(until)} : ${reason.trim()}`,
        },
      }),
    ]);
    const ctx = await contexteDecision(this.prisma, companyId, todayIso());
    // Au-delà de la livraison du projet, ou travail d'un Dir. GC : le CTO.
    const pushesBack = await this.circuit.pushesBackDelivery(companyId, task.projet, until);
    const escalated = pushesBack || ctx.dplgCollaborateurs.has(employeeId);
    const deciders = escalated ? ctx.comptesCto : await this.circuit.reviewers(ctx, employeeId, chiefOf(task.projet));
    await this.circuit.notify(
      companyId,
      projectId,
      task.projet.code,
      'prolongation_demandee',
      `Prolongation demandée · ${task.projet.code} · ${task.libelle}${pushesBack ? ' · repousse la livraison du projet' : ''}`,
      actor.userId,
      deciders,
    );
    return { ok: true };
  }

  // Décision (chef de team, sauf sa propre tâche ; Architecte DPLG partout).
  async decide(companyId: string, actor: Actor, projectId: string, taskId: string, grant: boolean) {
    verifierCircuit(actor.role);
    const task = await this.load(companyId, projectId, taskId);
    const pending = task.prolongations.find((p) => p.decision === null);
    if (!pending) throw new ConflictException('Aucune demande de prolongation en attente.');
    const employeeId = await collaborateurDuCompte(this.prisma, companyId, actor.userId);
    const ctx = await contexteDecision(this.prisma, companyId, todayIso());
    const assigneeIsDplg = !!task.assigneId && ctx.dplgCollaborateurs.has(task.assigneId);
    const pushesBack = await this.circuit.pushesBackDelivery(companyId, task.projet, pending.jusquau);
    if (
      !peutQualifier(
        { role: actor.role, collaborateurId: employeeId, ctoSupplee: ctx.ctoSupplee },
        { assigneId: task.assigneId, assigneEstDplg: assigneeIsDplg },
        chiefOf(task.projet),
        pushesBack,
      )
    ) {
      throw new ForbiddenException(
        pushesBack
          ? 'Cette prolongation repousse la livraison du projet : elle est décidée par le CTO.'
          : assigneeIsDplg
            ? 'Une prolongation du Dir. GC est décidée par le CTO.'
            : 'Le retard est qualifié par le chef de team ou l’Architecte DPLG, jamais sur sa propre tâche.',
      );
    }
    const date = formatDate(pending.jusquau);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.prolongationTache.updateMany({
        where: { id: pending.id, decision: null },
        data: { decision: grant ? 'accordee' : 'refusee', decideeLe: new Date(), decideeParId: actor.userId },
      });
      if (!count) throw new ConflictException('La demande a déjà été tranchée.');
      await tx.evenementTacheProjet.create({
        data: {
          tacheId: task.id,
          type: 'prolongation',
          parId: actor.userId,
          detail: grant
            ? `Prolongation accordée jusqu’au ${date} (retard qualifié)`
            : `Prolongation jusqu’au ${date} refusée`,
        },
      });
    });
    if (task.assigneId) {
      await this.circuit.notify(
        companyId,
        projectId,
        task.projet.code,
        'prolongation_decidee',
        `Prolongation ${grant ? 'accordée' : 'refusée'} · ${task.projet.code} · ${task.libelle}`,
        actor.userId,
        await this.circuit.accountsOf([task.assigneId]),
      );
    }
    return { decision: grant ? 'accordee' : 'refusee' };
  }

  private async load(companyId: string, projectId: string, taskId: string) {
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        finLe: true,
        assigneId: true,
        carte: { select: { desactivation: true } },
        prolongations: { orderBy: { demandeLe: 'desc' }, select: { id: true, jusquau: true, decision: true } },
        projet: { select: { code: true, ouvertLe: true, budgetHeures: true, cellules: CHIEF_CELL } },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    return task;
  }
}
