import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { nomPublic } from '../auth/profil';
import { aLaPermission } from '../commun/permission.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { commentsWithoutWrite, employeeOfAccount, projectScope, ROLE_EMPLOYEE } from './review-rules';
import { isOpenComment, resolutionRefusal } from './thread-rules';

type Actor = { userId: string };
type ThreadTarget = { carteId?: string; tacheId?: string };
// Nom affiché (choisi par la personne) dans les fils et les mentions.
const displayName = (p: { prenom: string; nom: string; nomAffiche?: string | null } | null) =>
  p ? nomPublic(p) : null;
const PERSON = { select: { id: true, prenom: true, nom: true, nomAffiche: true } } as const;
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
  ) {}

  // « Mentionner… » : les comptes actifs de la société.
  async mentionable(companyId: string) {
    const users = await this.prisma.utilisateur.findMany({
      where: { actif: true, roles: { some: { societeId: companyId } } },
      select: { id: true, prenom: true, nom: true, nomAffiche: true },
      orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
    });
    return users.map((u) => ({ id: u.id, nom: displayName(u)! }));
  }

  // « Mes tâches » (revue Salarié 19/10/2026) : les @mentions qui me visent
  // — non traitées, ou des 7 derniers jours —, avec de quoi y répondre
  // (fil de la tâche ou de la carte, commentaire racine).
  async myMentions(companyId: string, userId: string) {
    const since = new Date(Date.now() - READ_MENTIONS_KEPT_MS);
    const comments = await this.prisma.commentaireProjet.findMany({
      where: {
        mentionneId: userId,
        projet: { societeId: companyId },
        OR: [{ mentionLueLe: null }, { creeLe: { gte: since } }],
      },
      orderBy: { creeLe: 'desc' },
      take: 30,
      include: {
        auteur: PERSON,
        projet: { select: { code: true } },
        carte: { select: { libelle: true } },
        tache: { select: { libelle: true } },
      },
    });
    return comments.map((c) => ({
      id: c.id,
      texte: c.texte,
      creeLe: c.creeLe,
      lue: !!c.mentionLueLe,
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
    const comment = await this.prisma.commentaireProjet.findFirst({
      where: { id: commentId, mentionneId: userId, projet: { societeId: companyId } },
      select: { id: true, projetId: true, mentionLueLe: true },
    });
    if (!comment) throw new NotFoundException('Mention introuvable.');
    const now = new Date();
    if (!comment.mentionLueLe)
      await this.prisma.commentaireProjet.update({ where: { id: comment.id }, data: { mentionLueLe: now } });
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
        mentionne: PERSON,
        reponses: { orderBy: { creeLe: 'asc' }, include: { auteur: PERSON, mentionne: PERSON } },
      },
    });
    return roots.map((r) => ({
      ...this.format(r),
      ouvert: isOpenComment({ ...r, reponses: r.reponses.length }),
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

  // Écrire dans un fil : écriture sur Projets (matrice), Salarié sur un
  // projet où une tâche lui est assignée (maquette : « remise, prolongation,
  // discussion »), ou CEO (exception ciblée : commentaires seulement).
  async checkWrite(
    companyId: string,
    actor: Actor & { role: string; permissions?: Record<string, NiveauPermission> },
    projectId: string,
  ) {
    if (aLaPermission(actor.permissions, 'projets', 'ecriture')) return;
    if (commentsWithoutWrite(actor.role)) return;
    if (actor.role === ROLE_EMPLOYEE) {
      const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
      const project = await this.prisma.projet.findFirst({
        where: { id: projectId, societeId: companyId, ...projectScope(actor.role, employeeId) },
        select: { id: true },
      });
      if (project) return;
    }
    throw new ForbiddenException(
      'Écrire dans ce fil demande l’écriture sur Projets, ou une tâche assignée dans ce projet.',
    );
  }

  async post(
    companyId: string,
    actor: Actor,
    projectId: string,
    dto: ThreadTarget & { parentId?: string; texte: string; mentionneId?: string | null },
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
    const mentioned = dto.mentionneId
      ? await this.prisma.utilisateur.findFirst({
          where: { id: dto.mentionneId, actif: true, roles: { some: { societeId: companyId } } },
          select: { id: true },
        })
      : null;
    if (dto.mentionneId && !mentioned) throw new NotFoundException('Personne mentionnée introuvable.');

    const created = await this.prisma.commentaireProjet.create({
      data: {
        projetId: projectId,
        carteId,
        tacheId,
        parentId: dto.parentId ?? null,
        auteurId: actor.userId,
        mentionneId: mentioned?.id ?? null,
        texte: text,
      },
      include: { auteur: PERSON },
    });
    // Best-effort : une notification manquée ne fait pas échouer la publication.
    if (mentioned && mentioned.id !== actor.userId) {
      try {
        await this.notifications.pousser({
          societeId: companyId,
          projet: { id: projectId, code, celluleIds: [] },
          type: 'mention_projet',
          titre: `${displayName(created.auteur) ?? 'Quelqu’un'} vous mentionne · ${code} · ${libelle}`,
          parId: actor.userId,
          destinataireIds: [mentioned.id],
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
      select: { auteurId: true, mentionneId: true, resoluLe: true, _count: { select: { reponses: true } } },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    const refusal = resolutionRefusal({ ...comment, reponses: comment._count.reponses }, actor.userId);
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
    mentionne: { id: string; prenom: string; nom: string; nomAffiche?: string | null } | null;
  }) {
    return {
      id: c.id,
      texte: c.texte,
      le: c.creeLe,
      resoluLe: c.resoluLe,
      auteur: c.auteurId ? { id: c.auteurId, nom: displayName(c.auteur) } : null,
      mentionne: c.mentionne ? { id: c.mentionne.id, nom: displayName(c.mentionne)! } : null,
    };
  }
}
