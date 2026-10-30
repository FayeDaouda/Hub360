import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { ROLE_CTO, todayIso } from '@hub/domain';
import { aLaPermission } from '../commun/permission.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { tasksToAssign, unassignableReason } from './assignment-rules';
import { decisionContext } from './decision-context';
import { assertInCircuit, employeeOfAccount } from './review-rules';
import { fullName, type Actor } from './project-query';

// Assignation des tâches d'un projet ouvert (maquette « Projets ») : à la
// tâche ou à toute la carte, tracée dans l'historique de chaque tâche touchée.
//
// Qui assigne (décision du 29/10/2026) : l'écriture sur Projets (le Dir. GC ;
// le CTO seulement en suppléance), à n'importe qui ; et le chef d'une équipe
// du projet, aux seuls membres de ses équipes.
export type AssignActor = Actor & { permissions?: Record<string, NiveauPermission> };
// « all » : tout le monde ; sinon les cellules dont l'acteur est le chef.
export type AssignScope = 'all' | { cellIds: string[] };
@Injectable()
export class TaskAssignmentService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Périmètre d'assignation de l'acteur sur ce projet ; null = aucun.
  async scope(companyId: string, actor: AssignActor, projectId: string): Promise<AssignScope | null> {
    if (aLaPermission(actor.permissions, 'projets', 'ecriture')) {
      if (actor.role !== ROLE_CTO) return 'all';
      return (await decisionContext(this.prisma, companyId, todayIso())).ctoStandsIn ? 'all' : null;
    }
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    if (!employeeId) return null;
    const cells = await this.prisma.projetCellule.findMany({
      where: { projetId: projectId, projet: { societeId: companyId }, cellule: { dispatcherId: employeeId } },
      select: { celluleId: true },
    });
    return cells.length ? { cellIds: cells.map((c) => c.celluleId) } : null;
  }

  async scopeOrThrow(companyId: string, actor: AssignActor, projectId: string): Promise<AssignScope> {
    assertInCircuit(actor.role);
    const scope = await this.scope(companyId, actor, projectId);
    if (scope) return scope;
    throw new ForbiddenException(
      actor.role === ROLE_CTO
        ? 'Le CTO n’assigne les tâches qu’en suppléance d’un Dir. GC absent.'
        : 'Assigner le travail de ce projet est réservé au Dir. GC et aux chefs de ses équipes.',
    );
  }

  // Collaborateurs proposés dans « Assigner » (« Moussa Diop · GC-ARC-02 ») :
  // tous pour le Dir. GC, les membres de ses équipes pour un chef d'équipe.
  async assignable(companyId: string, actor: AssignActor, projectId: string) {
    const scope = await this.scopeOrThrow(companyId, actor, projectId);
    const employees = await this.prisma.collaborateur.findMany({
      where: { societeId: companyId, ...(scope === 'all' ? {} : { celluleId: { in: scope.cellIds } }) },
      select: { id: true, prenom: true, nom: true, cellule: { select: { nom: true } } },
      orderBy: [{ cellule: { nom: 'asc' } }, { prenom: 'asc' }, { nom: 'asc' }],
    });
    return employees.map((c) => ({ id: c.id, nom: fullName(c)!, cellule: c.cellule?.nom ?? null }));
  }

  async assign(
    companyId: string,
    actor: AssignActor,
    projectId: string,
    taskId: string,
    employeeId: string | null,
    wholeCard: boolean,
  ) {
    // Revue CTO (21/10/2026) : assigner, c'est organiser le travail — le Dir.
    // GC et les chefs d'équipe ; le CTO seulement en suppléance d'un Dir. GC.
    const scope = await this.scopeOrThrow(companyId, actor, projectId);
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
          select: { prenom: true, nom: true, celluleId: true },
        })
      : null;
    if (employeeId && !employee) throw new NotFoundException('Collaborateur introuvable');
    if (employee && scope !== 'all' && !(employee.celluleId && scope.cellIds.includes(employee.celluleId))) {
      throw new ForbiddenException('Un chef d’équipe assigne le travail aux membres de son équipe.');
    }

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
