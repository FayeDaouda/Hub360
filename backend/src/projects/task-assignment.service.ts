import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ETAPE, ROLE_CTO, todayIso } from '@hub/domain';
import { aLaPermission } from '../commun/permission.guard';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { tasksToAssign, unassignableReason } from './assignment-rules';
import { decisionContext } from './decision-context';
import { employeeOfAccount } from './review-rules';
import { fullName, type Actor } from './project-query';

// Assignation des tâches d'un projet ouvert (maquette « Projets ») : à la
// tâche ou à toute la carte, tracée dans l'historique de chaque tâche touchée.
//
// Qui assigne (décision du 29/10/2026) : l'écriture sur Projets (le Dir. GC ;
// le CTO seulement en suppléance), à n'importe qui ; et le chef d'une équipe
// du projet, aux seuls membres de ses équipes.
export type AssignActor = Actor & { permissions?: Record<string, string> };
// « all » : tout le monde ; sinon les cellules dont l'acteur est le chef.
export type AssignScope = 'all' | { cellIds: string[] };
@Injectable()
export class TaskAssignmentService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private chat: ChatService,
  ) {}

  // Périmètre d'assignation de l'acteur sur ce projet ; null = aucun.
  async scope(companyId: string, actor: AssignActor, projectId: string): Promise<AssignScope | null> {
    // Écriture de l'étape « Assignation » (matrice, 31/10/2026) ; circuit : le
    // CTO seulement en suppléance d'un Dir. GC absent ; le chef d'équipe sur
    // ses équipes, sans case.
    if (aLaPermission(actor.permissions, ETAPE.projetsAssignation, 'ecriture')) {
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
    const scope = await this.scope(companyId, actor, projectId);
    if (scope) return scope;
    throw new ForbiddenException(
      actor.role === ROLE_CTO
        ? 'Le CTO n’assigne les tâches qu’en suppléance d’un Dir. GC absent.'
        : 'Assigner le travail de ce projet demande l’Écriture de « Assignation », ou d’être chef d’une de ses équipes.',
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
    const employee = await this.target(companyId, scope, employeeId);

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
    const changed = await this.apply(actor, ids, employee);
    if (employee && changed > 0) {
      const others = changed > 1 ? ` (+ ${changed - 1} autre${changed > 2 ? 's' : ''})` : '';
      await this.notify(
        companyId,
        actor,
        projectId,
        employee.id,
        `Tâche assignée · ${task.projet.code} · ${task.libelle}${others}`,
      );
    }
    // La conversation du projet suit ses assignations.
    if (changed) await this.chat.synchroniserCanalProjet(projectId).catch(() => null);
    return { modifiees: changed };
  }

  // Assigner le bloc (bouton de l'en-tête de la carte, 30/10/2026) : toutes
  // ses tâches encore ouvertes ; les validées et non nécessaires gardent la
  // leur. Mêmes droits que la tâche.
  async assignCard(
    companyId: string,
    actor: AssignActor,
    projectId: string,
    cardId: string,
    employeeId: string | null,
  ) {
    const scope = await this.scopeOrThrow(companyId, actor, projectId);
    const card = await this.prisma.carteProjet.findFirst({
      where: { id: cardId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        libelle: true,
        desactivation: true,
        projet: { select: { code: true } },
        taches: { select: { id: true, statut: true } },
      },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    if (card.desactivation) throw new ConflictException('Carte désactivée : pas d’assignation.');
    const ids = card.taches.filter((t) => !unassignableReason({ ...t, cardDisabled: false })).map((t) => t.id);
    if (!ids.length) throw new ConflictException('Aucune tâche ouverte à assigner dans ce bloc.');
    const employee = await this.target(companyId, scope, employeeId);
    const changed = await this.apply(actor, ids, employee);
    if (employee && changed > 0) {
      await this.notify(
        companyId,
        actor,
        projectId,
        employee.id,
        `Bloc assigné · ${card.projet.code} · ${card.libelle} (${changed} tâche${changed > 1 ? 's' : ''})`,
      );
    }
    // La conversation du projet suit ses assignations.
    if (changed) await this.chat.synchroniserCanalProjet(projectId).catch(() => null);
    return { modifiees: changed };
  }

  // La personne choisie (null = retirer) : de la société, et membre d'une
  // équipe du chef d'équipe qui assigne.
  private async target(companyId: string, scope: AssignScope, employeeId: string | null) {
    if (!employeeId) return null;
    const employee = await this.prisma.collaborateur.findFirst({
      where: { id: employeeId, societeId: companyId },
      select: { id: true, prenom: true, nom: true, celluleId: true },
    });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');
    if (scope !== 'all' && !(employee.celluleId && scope.cellIds.includes(employee.celluleId))) {
      throw new ForbiddenException('Un chef d’équipe assigne le travail aux membres de son équipe.');
    }
    return employee;
  }

  // Écrit l'assignation et l'historique de chaque tâche touchée. Garde en
  // base : une tâche validée entre-temps n'est pas réassignée.
  private async apply(actor: AssignActor, ids: string[], employee: { id: string; prenom: string; nom: string } | null) {
    const detail = employee ? `Assignée à ${fullName(employee)}` : 'Assignation retirée';
    return this.prisma.$transaction(async (tx) => {
      const targets = await tx.tacheProjet.findMany({
        where: { id: { in: ids }, statut: { notIn: ['validee', 'non_necessaire'] } },
        select: { id: true },
      });
      const targetIds = targets.map((c) => c.id);
      await tx.tacheProjet.updateMany({ where: { id: { in: targetIds } }, data: { assigneId: employee?.id ?? null } });
      await tx.evenementTacheProjet.createMany({
        data: targetIds.map((id) => ({ tacheId: id, type: 'assignation' as const, parId: actor.userId, detail })),
      });
      return targetIds.length;
    });
  }

  private async notify(companyId: string, actor: AssignActor, projectId: string, employeeId: string, titre: string) {
    await this.notifications.envoyer({
      societeId: companyId,
      type: 'tache_assignee',
      titre,
      destinataireIds: await this.notifications.comptesDe([employeeId]),
      parId: actor.userId,
      projetId: projectId,
    });
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
