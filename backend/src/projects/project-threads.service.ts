import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { nomPublic } from '../auth/profil';
import { estRoleBackOffice } from '../commun/back-office.guard';
import { aLaPermission } from '../commun/permission.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RightsService } from '../rights/rights.service';
import { canWriteThreads, employeeOfAccount, projectScope } from './review-rules';
import { isOpenComment, resolutionRefusal } from './thread-rules';
import { ROLE_CIO, ROLE_EMPLOYEE, ROLE_HUB_ADMIN } from '@hub/domain';

type Actor = { userId: string };
type ThreadTarget = { carteId?: string; tacheId?: string };
// Nom affiché (choisi par la personne) dans les fils et les mentions.
const displayName = (p: { prenom: string; nom: string; nomAffiche?: string | null } | null) =>
  p ? nomPublic(p) : null;
const PERSON = { select: { id: true, prenom: true, nom: true, nomAffiche: true } } as const;
// Personnes citées (@) d'un commentaire.
const MENTIONS = { select: { utilisateur: PERSON } } as const;
// « Mes tâches » : les mentions déjà traitées restent visibles 7 jours.
const READ_MENTIONS_KEPT_MS = 7 * 86_400_000;

// Fils de discussion d'un projet ouvert (maquette « Projets ») : un par
// carte (« Fil de la carte ») et un par tâche ; @mention notifiée.
@Injectable()
export class ProjectThreadsService {
  private readonly log = new Logger(ProjectThreadsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private rights: RightsService,
  ) {}

  // « @ » (09/11/2026) : seulement les comptes qui peuvent lire le projet —
  // on ne cite pas quelqu'un qui ne verrait ni le projet ni la discussion.
  async mentionable(companyId: string, projectId: string) {
    const readers = await this.projectReaders(companyId, projectId);
    const users = await this.prisma.utilisateur.findMany({
      where: { actif: true, roles: { some: { societeId: companyId } }, id: { in: [...readers] } },
      select: { id: true, prenom: true, nom: true, nomAffiche: true },
      orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
    });
    return users.map((u) => ({ id: u.id, nom: displayName(u)! }));
  }

  // Comptes actifs de la société qui peuvent lire le projet — mêmes règles
  // que les gardes et checkRead : back-office, Lecture de « projets » (carte
  // blanche pour le CIO et l'Administrateur HUB), et pour le Salarié, le
  // périmètre du projet (une tâche, chef ou membre d'une de ses équipes).
  async projectReaders(companyId: string, projectId: string): Promise<Set<string>> {
    const [rows, project] = await Promise.all([
      this.prisma.utilisateurSocieteRole.findMany({
        where: { societeId: companyId, utilisateur: { actif: true }, role: { supprimeLe: null } },
        select: { utilisateurId: true, roleId: true, role: { select: { nom: true } } },
      }),
      this.prisma.projet.findFirst({
        where: { id: projectId, societeId: companyId },
        select: {
          cartes: { select: { taches: { select: { assigneId: true } } } },
          cellules: { select: { cellule: { select: { dispatcherId: true, membres: { select: { id: true } } } } } },
        },
      }),
    ]);
    if (!project) throw new NotFoundException('Projet introuvable');
    // Salariés du périmètre : fiches collaborateur, puis leurs comptes.
    const scope = new Set<string>();
    project.cartes.forEach((c) => c.taches.forEach((t) => t.assigneId && scope.add(t.assigneId)));
    project.cellules.forEach(({ cellule }) => {
      if (cellule.dispatcherId) scope.add(cellule.dispatcherId);
      cellule.membres.forEach((m) => scope.add(m.id));
    });
    const employees = scope.size
      ? await this.prisma.collaborateur.findMany({
          where: { societeId: companyId, id: { in: [...scope] } },
          select: { utilisateurId: true, dossierPersonnel: { select: { utilisateurId: true } } },
        })
      : [];
    const inScope = new Set(
      employees.flatMap((e) => [e.utilisateurId, e.dossierPersonnel?.utilisateurId]).filter((x): x is string => !!x),
    );
    // Droits calculés une fois par rôle (plusieurs comptes partagent un rôle).
    const roleRights = new Map<string, Promise<Record<string, string>>>();
    const rightsOf = (roleId: string) => {
      if (!roleRights.has(roleId)) roleRights.set(roleId, this.rights.forRole(roleId, companyId));
      return roleRights.get(roleId)!;
    };
    const readers = new Set<string>();
    for (const r of rows) {
      const role = r.role.nom;
      if (!estRoleBackOffice(role)) continue;
      if (role === ROLE_CIO || role === ROLE_HUB_ADMIN) {
        readers.add(r.utilisateurId);
        continue;
      }
      if (!aLaPermission(await rightsOf(r.roleId), 'projets', 'lecture')) continue;
      if (role === ROLE_EMPLOYEE && !inScope.has(r.utilisateurId)) continue;
      readers.add(r.utilisateurId);
    }
    return readers;
  }

  // « Mes tâches » (revue Salarié 19/10/2026) : les @mentions qui me visent
  // — non traitées, ou des 7 derniers jours —, avec de quoi y répondre
  // (fil de la tâche ou de la carte, commentaire racine).
  async myMentions(companyId: string, userId: string) {
    const since = new Date(Date.now() - READ_MENTIONS_KEPT_MS);
    const comments = await this.prisma.commentaireProjet.findMany({
      where: {
        projet: { societeId: companyId },
        mentions: { some: { utilisateurId: userId } },
        OR: [{ mentions: { some: { utilisateurId: userId, lueLe: null } } }, { creeLe: { gte: since } }],
      },
      orderBy: { creeLe: 'desc' },
      take: 30,
      include: {
        auteur: PERSON,
        mentions: { where: { utilisateurId: userId }, select: { lueLe: true } },
        projet: { select: { code: true } },
        carte: { select: { libelle: true } },
        tache: { select: { libelle: true } },
      },
    });
    return comments.map((c) => ({
      id: c.id,
      texte: c.texte,
      creeLe: c.creeLe,
      lue: !!c.mentions[0]?.lueLe,
      auteur: displayName(c.auteur),
      auteurId: c.auteur?.id ?? null,
      projetId: c.projetId,
      projetCode: c.projet.code,
      carteId: c.carteId,
      tacheId: c.tacheId,
      cible: c.tache?.libelle ?? c.carte.libelle,
      racineId: c.parentId ?? c.id,
    }));
  }

  // Mention traitée (lue, ou répondue) ; la cloche suit pour ce projet.
  async markMentionRead(companyId: string, userId: string, commentId: string) {
    const mention = await this.prisma.mentionCommentaireProjet.findFirst({
      where: { commentaireId: commentId, utilisateurId: userId, commentaire: { projet: { societeId: companyId } } },
      select: { lueLe: true, commentaire: { select: { id: true, projetId: true } } },
    });
    if (!mention) throw new NotFoundException('Mention introuvable.');
    const comment = mention.commentaire;
    const now = new Date();
    if (!mention.lueLe)
      await this.prisma.mentionCommentaireProjet.update({
        where: { commentaireId_utilisateurId: { commentaireId: comment.id, utilisateurId: userId } },
        data: { lueLe: now },
      });
    await this.prisma.notification.updateMany({
      where: {
        destinataireId: userId,
        societeId: companyId,
        type: 'mention_projet',
        projetId: comment.projetId,
        luLe: null,
      },
      data: { luLe: now },
    });
    return { id: comment.id };
  }

  // Fil d'une carte (tacheId absent) ou d'une tâche.
  async read(companyId: string, projectId: string, target: ThreadTarget) {
    const { carteId, tacheId } = await this.target(companyId, projectId, target);
    const roots = await this.prisma.commentaireProjet.findMany({
      where: { carteId, tacheId: tacheId ?? null, parentId: null },
      orderBy: { creeLe: 'asc' },
      include: {
        auteur: PERSON,
        mentions: MENTIONS,
        reponses: { orderBy: { creeLe: 'asc' }, include: { auteur: PERSON, mentions: MENTIONS } },
      },
    });
    return roots.map((r) => ({
      ...this.format(r),
      ouvert: isOpenComment({ ...r, mentions: r.mentions.length, reponses: r.reponses.length }),
      reponses: r.reponses.map((x) => this.format(x)),
    }));
  }

  // Salarié : il ne lit que les projets où une tâche lui est assignée.
  async checkRead(companyId: string, actor: Actor & { role: string }, projectId: string) {
    if (actor.role !== ROLE_EMPLOYEE) return;
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    const project = await this.prisma.projet.findFirst({
      where: { id: projectId, societeId: companyId, ...projectScope(actor.role, employeeId) },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
  }

  // Écrire dans un fil : l'Écriture de « Fils de discussion » (matrice,
  // 31/10/2026 ; au départ qui écrivait dans Projets, le CEO, le CFO et le
  // Salarié) ; le Salarié, sur un projet de son périmètre seulement.
  async checkWrite(
    companyId: string,
    actor: Actor & { role: string; permissions?: Record<string, string> },
    projectId: string,
  ) {
    if (!canWriteThreads(actor)) {
      throw new ForbiddenException('Écrire dans ce fil demande l’Écriture de « Fils de discussion ».');
    }
    if (actor.role !== ROLE_EMPLOYEE) return;
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    const project = await this.prisma.projet.findFirst({
      where: { id: projectId, societeId: companyId, ...projectScope(actor.role, employeeId) },
      select: { id: true },
    });
    if (!project) throw new ForbiddenException('Ce projet n’est pas dans votre périmètre (tâche ou équipe).');
  }

  async post(
    companyId: string,
    actor: Actor,
    projectId: string,
    dto: ThreadTarget & { parentId?: string; texte: string; mentionIds?: string[] },
  ) {
    const text = dto.texte.trim();
    if (!text) throw new BadRequestException('Le commentaire est vide.');
    const { carteId, tacheId, code, libelle } = await this.target(companyId, projectId, dto);
    if (dto.parentId) {
      const parent = await this.prisma.commentaireProjet.findFirst({
        where: { id: dto.parentId, carteId, tacheId: tacheId ?? null, parentId: null },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Commentaire introuvable dans ce fil.');
    }
    // Personnes citées : qui peut lire le projet, chacune une fois ; l'auteur
    // qui se cite n'attend pas sa propre réponse. Un compte parti, étranger
    // à la société ou sans accès au projet est ignoré : la réponse à une
    // mention dont l'auteur est parti part quand même, sans le prévenir.
    const requested = [...new Set(dto.mentionIds ?? [])].filter((id) => id !== actor.userId);
    const readers = requested.length ? await this.projectReaders(companyId, projectId) : new Set<string>();
    const mentionIds = requested.filter((id) => readers.has(id));

    const created = await this.prisma.commentaireProjet.create({
      data: {
        projetId: projectId,
        carteId,
        tacheId,
        parentId: dto.parentId ?? null,
        auteurId: actor.userId,
        texte: text,
        mentions: { create: mentionIds.map((utilisateurId) => ({ utilisateurId })) },
      },
      include: { auteur: PERSON },
    });
    // Best-effort : une notification manquée ne fait pas échouer la publication.
    if (mentionIds.length) {
      try {
        await this.notifications.pousser({
          societeId: companyId,
          projet: { id: projectId, code, celluleIds: [] },
          type: 'mention_projet',
          titre: `${displayName(created.auteur) ?? 'Quelqu’un'} vous mentionne · ${code} · ${libelle}`,
          parId: actor.userId,
          destinataireIds: mentionIds,
        });
      } catch (e) {
        this.log.error(`Mention non notifiée (${created.id}) : ${e instanceof Error ? e.message : e}`);
      }
    }
    return { id: created.id };
  }

  async resolve(companyId: string, actor: Actor, projectId: string, commentId: string) {
    const comment = await this.prisma.commentaireProjet.findFirst({
      where: { id: commentId, projetId: projectId, projet: { societeId: companyId }, parentId: null },
      select: { auteurId: true, resoluLe: true, _count: { select: { reponses: true, mentions: true } } },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    const refusal = resolutionRefusal(
      { ...comment, mentions: comment._count.mentions, reponses: comment._count.reponses },
      actor.userId,
    );
    if (refusal)
      throw comment.auteurId !== actor.userId ? new ForbiddenException(refusal) : new ConflictException(refusal);
    await this.prisma.commentaireProjet.update({ where: { id: commentId }, data: { resoluLe: new Date() } });
    return { ok: true };
  }

  // --- internes -----------------------------------------------------------------------
  // Carte ou tâche du projet (ouvert, de la société) ; la tâche fixe sa carte.
  private async target(companyId: string, projectId: string, t: ThreadTarget) {
    if (!!t.carteId === !!t.tacheId) throw new BadRequestException('Indique la carte ou la tâche du fil.');
    if (t.tacheId) {
      const task = await this.prisma.tacheProjet.findFirst({
        where: { id: t.tacheId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
        select: { id: true, carteId: true, libelle: true, projet: { select: { code: true } } },
      });
      if (!task) throw new NotFoundException('Tâche introuvable');
      return { carteId: task.carteId, tacheId: task.id, code: task.projet.code, libelle: task.libelle };
    }
    const card = await this.prisma.carteProjet.findFirst({
      where: { id: t.carteId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: { id: true, libelle: true, projet: { select: { code: true } } },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    return { carteId: card.id, tacheId: null, code: card.projet.code, libelle: card.libelle };
  }

  private format(c: {
    id: string;
    texte: string;
    creeLe: Date;
    resoluLe: Date | null;
    auteurId: string | null;
    auteur: { prenom: string; nom: string; nomAffiche?: string | null } | null;
    mentions: { utilisateur: { id: string; prenom: string; nom: string; nomAffiche?: string | null } }[];
  }) {
    return {
      id: c.id,
      texte: c.texte,
      le: c.creeLe,
      resoluLe: c.resoluLe,
      auteur: c.auteurId ? { id: c.auteurId, nom: displayName(c.auteur) } : null,
      mentions: c.mentions
        .map((m) => ({ id: m.utilisateur.id, nom: displayName(m.utilisateur)! }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    };
  }
}
