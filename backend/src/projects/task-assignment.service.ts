import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_CTO, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { tasksToAssign, unassignableReason } from './assignment-rules';
import { decisionContext } from './decision-context';
import { assertInCircuit } from './review-rules';
import { fullName, type Actor } from './project-query';

// Assignation des tâches d'un projet ouvert (maquette « Projets ») : à la
// tâche ou à toute la carte, tracée dans l'historique de chaque tâche touchée.
@Injectable()
export class TaskAssignmentService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Collaborateurs proposés dans « Assigner » (« Moussa Diop · GC-ARC-02 »).
  async assignable(companyId: string) {
    const employees = await this.prisma.collaborateur.findMany({
      where: { societeId: companyId },
      select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } },
      orderBy: [{ cellule: { nom: 'asc' } }, { prenom: 'asc' }, { nom: 'asc' }],
    });
    return employees.map((c) => ({ id: c.id, nom: fullName(c)!, cellule: c.cellule?.nom ?? null }));
  }

  async assign(
    companyId: string,
    actor: Actor,
    projectId: string,
    taskId: string,
    employeeId: string | null,
    wholeCard: boolean,
  ) {
    assertInCircuit(actor.role);
    // Revue CTO (21/10/2026) : assigner, c'est organiser le travail — le Dir.
    // GC et les chefs de cellule ; le CTO seulement en suppléance d'un Dir. GC.
    if (actor.role === ROLE_CTO && !(await decisionContext(this.prisma, companyId, todayIso())).ctoStandsIn) {
      throw new ForbiddenException('Le CTO n’assigne les tâches qu’en suppléance d’un Dir. GC absent.');
    }
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        projet: { select: { code: true } },
        carte: { select: { desactivation: true, taches: { select: { id: true, statut: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    const employee = employeeId
      ? await this.prisma.collaborateur.findFirst({
          where: { id: employeeId, societeId: companyId },
          select: { prenom: true, nom: true },
        })
      : null;
    if (employeeId && !employee) throw new NotFoundException('Collaborateur introuvable');

    const disabled = !!task.carte.desactivation;
    const chosen = { id: task.id, statut: task.statut, cardDisabled: disabled };
    const reason = unassignableReason(chosen);
    if (reason && !wholeCard) throw new ConflictException(reason);
    const ids = tasksToAssign(
      chosen,
      task.carte.taches.map((t) => ({ ...t, cardDisabled: disabled })),
      wholeCard,
    );
    if (!ids.length) throw new ConflictException('Aucune tâche ouverte à assigner dans cette carte.');

    const detail = employee ? `Assignée à ${fullName(employee)}` : 'Assignation retirée';
    // Garde en base : une tâche validée entre-temps n'est pas réassignée.
    const changed = await this.prisma.$transaction(async (tx) => {
      const targets = await tx.tacheProjet.findMany({
        where: { id: { in: ids }, statut: { notIn: ['validee', 'non_necessaire'] } },
        select: { id: true },
      });
      const targetIds = targets.map((c) => c.id);
      await tx.tacheProjet.updateMany({ where: { id: { in: targetIds } }, data: { assigneId: employeeId } });
      await tx.evenementTacheProjet.createMany({
        data: targetIds.map((id) => ({ tacheId: id, type: 'assignation' as const, parId: actor.userId, detail })),
      });
      return targetIds.length;
    });
    if (employeeId && changed > 0) {
      const others = changed > 1 ? ` (+ ${changed - 1} autre${changed > 2 ? 's' : ''})` : '';
      await this.notifications.envoyer({
        societeId: companyId,
        type: 'tache_assignee',
        titre: `Tâche assignée · ${task.projet.code} · ${task.libelle}${others}`,
        destinataireIds: await this.notifications.comptesDe([employeeId]),
        parId: actor.userId,
        projetId: projectId,
      });
    }
    return { modifiees: changed };
  }

  async history(companyId: string, projectId: string, taskId: string) {
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId } },
      select: {
        evenements: {
          orderBy: { creeLe: 'asc' },
          select: { id: true, type: true, detail: true, creeLe: true, par: { select: { prenom: true, nom: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    return task.evenements.map((e) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      par: fullName(e.par),
      le: e.creeLe,
    }));
  }
}
