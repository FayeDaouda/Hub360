import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReglagesService } from '../reglages/reglages.service';
import { decisionContext, deliveryDate, type DecisionContext } from './decision-context';

// Circuit de validation des tâches d'un projet : qui prévenir d'une remise,
// d'une prolongation ou d'un visa, et la notification elle-même.
@Injectable()
export class ReviewCircuitService {
  private log = new Logger(ReviewCircuitService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private reglages: ReglagesService,
  ) {}

  // Comptes HUB des collaborateurs (fiche reliée directement ou via le dossier RH).
  async accountsOf(employeeIds: string[]): Promise<string[]> {
    const c = await this.prisma.collaborateur.findMany({
      where: { id: { in: employeeIds } },
      select: { utilisateurId: true, dossierPersonnel: { select: { utilisateurId: true } } },
    });
    return [
      ...new Set(
        c.flatMap((x) => [x.utilisateurId, x.dossierPersonnel?.utilisateurId].filter((id): id is string => !!id)),
      ),
    ];
  }

  // Qui prévenir d'une remise ou d'une prolongation : le chef d’équipe s'il a
  // un compte et n'est pas absent ; sinon l'Architecte DPLG (ou son
  // suppléant) ; le CTO pour le travail d'un Dir. GC.
  async reviewers(ctx: DecisionContext, assigneeId: string | null, chiefId: string | null): Promise<string[]> {
    return (await this.circuit(ctx, assigneeId, chiefId)).ids;
  }

  // Le même circuit, avec le rôle de la personne qui valide (affiché à l'assigné).
  private async circuit(
    ctx: DecisionContext,
    assigneeId: string | null,
    chiefId: string | null,
  ): Promise<{ ids: string[]; role: string }> {
    if (assigneeId && ctx.dplgEmployees.has(assigneeId)) return { ids: ctx.ctoAccounts, role: 'CTO' };
    if (chiefId && chiefId !== assigneeId && !ctx.absentEmployees.has(chiefId)) {
      const chief = await this.accountsOf([chiefId]);
      if (chief.length) return { ids: chief, role: 'chef d’équipe' };
    }
    return { ids: ctx.dplgAccounts, role: 'Architecte DPLG' };
  }

  // Qui valide, en clair, pour l'assigné (Mes tâches, panneau) : les MÊMES
  // personnes que celles prévenues au dépôt (circuit plus haut), et non le
  // nom du signataire des contrats, souvent vide. null : personne à prévenir.
  async reviewerNames(
    companyId: string,
    tasks: { id: string; assigneId: string | null; chefId: string | null }[],
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (!tasks.length) return result;
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    const byTask = await Promise.all(
      tasks.map(async (t) => ({ id: t.id, ...(await this.circuit(ctx, t.assigneId, t.chefId)) })),
    );
    const people = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(byTask.flatMap((x) => x.ids))] }, actif: true },
      select: { id: true, prenom: true, nom: true },
    });
    const nameOf = new Map(people.map((u) => [u.id, `${u.prenom} ${u.nom}`.trim()]));
    for (const x of byTask) {
      const names = x.ids.map((id) => nameOf.get(id)).filter((n): n is string => !!n);
      result.set(x.id, names.length ? `${names.join(' ou ')} (${x.role})` : null);
    }
    return result;
  }

  // Qui vise : les Dir. GC présents (ou un Dir. GC suppléant). Aucun : le visa
  // attend leur retour et le CTO en est prévenu (il ne vise pas à leur place).
  async visaHolders(companyId: string): Promise<{ comptes: string[]; enAttente: boolean }> {
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    const dirGc = ctx.dplgAccounts.filter((id) => !ctx.ctoAccounts.includes(id));
    return dirGc.length ? { comptes: dirGc, enAttente: false } : { comptes: ctx.ctoAccounts, enAttente: true };
  }

  // La nouvelle date dépasse-t-elle la livraison du projet (jour J de son horizon) ?
  async pushesBackDelivery(
    companyId: string,
    project: { ouvertLe: string | null; budgetHeures: number | null },
    until: string,
  ): Promise<boolean> {
    const holidays = (await this.reglages.joursFeries([companyId])).get(companyId) ?? new Set<string>();
    const delivery = deliveryDate(project, holidays);
    return !!delivery && until > delivery;
  }

  // Best-effort : une notification manquée ne fait pas échouer l'action.
  async notify(
    companyId: string,
    projectId: string,
    code: string,
    type: NotificationType,
    titre: string,
    parId: string,
    recipientIds: string[],
  ) {
    const targets = recipientIds.filter((id) => id !== parId);
    if (!targets.length) return;
    try {
      await this.notifications.pousser({
        societeId: companyId,
        projet: { id: projectId, code, celluleIds: [] },
        type,
        titre,
        parId,
        destinataireIds: targets,
      });
    } catch (e) {
      this.log.error(`Notification ${type} non envoyée : ${e instanceof Error ? e.message : e}`);
    }
  }
}
