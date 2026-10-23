import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { aLaPermission } from '../../commun/permission.guard';
import { collaborateurDuCompte, commenteSansEcriture, perimetreProjets, ROLE_SALARIE } from './validation';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { estOuvert, motifRefusResolution } from './fil';
import { nomPublic } from '../../auth/profil';

type Acteur = { userId: string };
// Nom affiché (choisi par la personne) dans les fils et les mentions.
const nom = (p: { prenom: string; nom: string; nomAffiche?: string | null } | null) => (p ? nomPublic(p) : null);
const PERSONNE = { select: { id: true, prenom: true, nom: true, nomAffiche: true } } as const;

// Fils de discussion d'un projet ouvert (maquette « Projets ») : un par
// carte (« Fil de la carte ») et un par tâche ; @mention notifiée.
@Injectable()
export class FilsProjetService {
  private readonly log = new Logger('FilsProjet');

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // « Mentionner… » : les comptes actifs de la société.
  async mentionnables(societeId: string) {
    const utilisateurs = await this.prisma.utilisateur.findMany({
      where: { actif: true, roles: { some: { societeId } } },
      select: { id: true, prenom: true, nom: true, nomAffiche: true },
      orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
    });
    return utilisateurs.map((u) => ({ id: u.id, nom: nom(u)! }));
  }

  // « Mes tâches » (revue Salarié 19/10/2026) : les @mentions qui me visent
  // — non traitées, ou des 7 derniers jours —, avec de quoi y répondre
  // (fil de la tâche ou de la carte, commentaire racine).
  async mesMentions(societeId: string, userId: string) {
    const depuis = new Date(Date.now() - 7 * 86_400_000);
    const l = await this.prisma.commentaireProjet.findMany({
      where: { mentionneId: userId, projet: { societeId }, OR: [{ mentionLueLe: null }, { creeLe: { gte: depuis } }] },
      orderBy: { creeLe: 'desc' },
      take: 30,
      include: {
        auteur: PERSONNE,
        projet: { select: { code: true } },
        carte: { select: { libelle: true } },
        tache: { select: { libelle: true } },
      },
    });
    return l.map((c) => ({
      id: c.id,
      texte: c.texte,
      creeLe: c.creeLe,
      lue: !!c.mentionLueLe,
      auteur: nom(c.auteur),
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
  async marquerMentionLue(societeId: string, userId: string, commentaireId: string) {
    const c = await this.prisma.commentaireProjet.findFirst({
      where: { id: commentaireId, mentionneId: userId, projet: { societeId } },
      select: { id: true, projetId: true, mentionLueLe: true },
    });
    if (!c) throw new NotFoundException('Mention introuvable.');
    const maintenant = new Date();
    if (!c.mentionLueLe) await this.prisma.commentaireProjet.update({ where: { id: c.id }, data: { mentionLueLe: maintenant } });
    await this.prisma.notification.updateMany({
      where: { destinataireId: userId, societeId, type: 'mention_projet', projetId: c.projetId, luLe: null },
      data: { luLe: maintenant },
    });
    return { id: c.id };
  }

  // Fil d'une carte (tacheId absent) ou d'une tâche.
  async lire(societeId: string, projetId: string, cible: { carteId?: string; tacheId?: string }) {
    const { carteId, tacheId } = await this.cible(societeId, projetId, cible);
    const racines = await this.prisma.commentaireProjet.findMany({
      where: { carteId, tacheId: tacheId ?? null, parentId: null },
      orderBy: { creeLe: 'asc' },
      include: {
        auteur: PERSONNE,
        mentionne: PERSONNE,
        reponses: { orderBy: { creeLe: 'asc' }, include: { auteur: PERSONNE, mentionne: PERSONNE } },
      },
    });
    return racines.map((r) => ({
      ...this.format(r),
      ouvert: estOuvert({ ...r, reponses: r.reponses.length }),
      reponses: r.reponses.map((x) => this.format(x)),
    }));
  }

  // Salarié : il ne lit que les projets où une tâche lui est assignée.
  async verifierLecture(societeId: string, acteur: Acteur & { role: string }, projetId: string) {
    if (acteur.role !== ROLE_SALARIE) return;
    const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
    const p = await this.prisma.projet.findFirst({ where: { id: projetId, societeId, ...perimetreProjets(acteur.role, collaborateurId) }, select: { id: true } });
    if (!p) throw new NotFoundException('Projet introuvable');
  }

  // Écrire dans un fil : écriture sur Projets (matrice), Salarié sur un
  // projet où une tâche lui est assignée (maquette : « remise, prolongation,
  // discussion »), ou CEO (exception ciblée : commentaires seulement).
  async verifierEcriture(societeId: string, acteur: Acteur & { role: string; permissions?: Record<string, NiveauPermission> }, projetId: string) {
    if (aLaPermission(acteur.permissions, 'projets', 'ecriture')) return;
    if (commenteSansEcriture(acteur.role)) return;
    if (acteur.role === ROLE_SALARIE) {
      const collaborateurId = await collaborateurDuCompte(this.prisma, societeId, acteur.userId);
      const p = await this.prisma.projet.findFirst({ where: { id: projetId, societeId, ...perimetreProjets(acteur.role, collaborateurId) }, select: { id: true } });
      if (p) return;
    }
    throw new ForbiddenException('Écrire dans ce fil demande l’écriture sur Projets, ou une tâche assignée dans ce projet.');
  }

  async publier(
    societeId: string,
    acteur: Acteur,
    projetId: string,
    dto: { carteId?: string; tacheId?: string; parentId?: string; texte: string; mentionneId?: string | null },
  ) {
    const texte = dto.texte.trim();
    if (!texte) throw new BadRequestException('Le commentaire est vide.');
    const { carteId, tacheId, code, libelle } = await this.cible(societeId, projetId, dto);
    if (dto.parentId) {
      const parent = await this.prisma.commentaireProjet.findFirst({
        where: { id: dto.parentId, carteId, tacheId: tacheId ?? null, parentId: null },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Commentaire introuvable dans ce fil.');
    }
    const mentionne = dto.mentionneId
      ? await this.prisma.utilisateur.findFirst({
          where: { id: dto.mentionneId, actif: true, roles: { some: { societeId } } },
          select: { id: true },
        })
      : null;
    if (dto.mentionneId && !mentionne) throw new NotFoundException('Personne mentionnée introuvable.');

    const cree = await this.prisma.commentaireProjet.create({
      data: { projetId, carteId, tacheId, parentId: dto.parentId ?? null, auteurId: acteur.userId, mentionneId: mentionne?.id ?? null, texte },
      include: { auteur: PERSONNE },
    });
    // Best-effort : une notification manquée ne fait pas échouer la publication.
    if (mentionne && mentionne.id !== acteur.userId) {
      try {
        await this.notifications.pousser({
          societeId,
          projet: { id: projetId, code, celluleIds: [] },
          type: 'mention_projet',
          titre: `${nom(cree.auteur) ?? 'Quelqu’un'} vous mentionne · ${code} · ${libelle}`,
          parId: acteur.userId,
          destinataireIds: [mentionne.id],
        });
      } catch (e) {
        this.log.error(`Mention non notifiée (${cree.id}) : ${e instanceof Error ? e.message : e}`);
      }
    }
    return { id: cree.id };
  }

  async resoudre(societeId: string, acteur: Acteur, projetId: string, commentaireId: string) {
    const c = await this.prisma.commentaireProjet.findFirst({
      where: { id: commentaireId, projetId, projet: { societeId }, parentId: null },
      select: { auteurId: true, mentionneId: true, resoluLe: true, _count: { select: { reponses: true } } },
    });
    if (!c) throw new NotFoundException('Commentaire introuvable');
    const motif = motifRefusResolution({ ...c, reponses: c._count.reponses }, acteur.userId);
    if (motif) throw c.auteurId !== acteur.userId ? new ForbiddenException(motif) : new ConflictException(motif);
    await this.prisma.commentaireProjet.update({ where: { id: commentaireId }, data: { resoluLe: new Date() } });
    return { ok: true };
  }

  // --- internes -----------------------------------------------------------------------
  // Carte ou tâche du projet (ouvert, de la société) ; la tâche fixe sa carte.
  private async cible(societeId: string, projetId: string, c: { carteId?: string; tacheId?: string }) {
    if (!!c.carteId === !!c.tacheId) throw new BadRequestException('Indique la carte ou la tâche du fil.');
    if (c.tacheId) {
      const t = await this.prisma.tacheProjet.findFirst({
        where: { id: c.tacheId, projetId, projet: { societeId, ouvertLe: { not: null } } },
        select: { id: true, carteId: true, libelle: true, projet: { select: { code: true } } },
      });
      if (!t) throw new NotFoundException('Tâche introuvable');
      return { carteId: t.carteId, tacheId: t.id, code: t.projet.code, libelle: t.libelle };
    }
    const carte = await this.prisma.carteProjet.findFirst({
      where: { id: c.carteId, projetId, projet: { societeId, ouvertLe: { not: null } } },
      select: { id: true, libelle: true, projet: { select: { code: true } } },
    });
    if (!carte) throw new NotFoundException('Carte introuvable');
    return { carteId: carte.id, tacheId: null, code: carte.projet.code, libelle: carte.libelle };
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
      auteur: c.auteurId ? { id: c.auteurId, nom: nom(c.auteur) } : null,
      mentionne: c.mentionne ? { id: c.mentionne.id, nom: nom(c.mentionne)! } : null,
    };
  }
}
