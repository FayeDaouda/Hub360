import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TypeCanal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { estRoleBackOffice } from '../commun/back-office.guard';
import { ChatBus } from './chat.bus';
import { cheminPhoto, nomPublic } from '../auth/profil';

type Acteur = { userId: string; societeId: string; role: string };

const PAGE = 50;

export type CanalResume = {
  id: string;
  type: TypeCanal;
  nom: string;
  nonLus: number;
  dernierMessageLe: Date | null;
};

export type MessageRendu = {
  id: string;
  canalId: string;
  texte: string;
  envoyeLe: Date;
  auteur: { id: string; nom: string; photoUrl: string | null };
};

type CanalNommable = {
  type: TypeCanal;
  cellule: { nom: string } | null;
  participant1: { id: string; prenom: string; nom: string; nomAffiche: string | null } | null;
  participant2: { id: string; prenom: string; nom: string; nomAffiche: string | null } | null;
};

const SELECT_CANAL = {
  id: true,
  type: true,
  celluleId: true,
  participant1Id: true,
  participant2Id: true,
  cellule: { select: { nom: true } },
  participant1: { select: { id: true, prenom: true, nom: true, nomAffiche: true } },
  participant2: { select: { id: true, prenom: true, nom: true, nomAffiche: true } },
} satisfies Prisma.CanalSelect;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private bus: ChatBus,
  ) {}

  // -- Liste des canaux visibles + non-lus par canal ---------------------
  async listerCanaux(acteur: Acteur): Promise<CanalResume[]> {
    const { societeId, userId } = acteur;
    const estAdmin = acteur.role === 'societe_admin';

    await this.coquilleGeneral(societeId);
    let celluleId: string | null = null;
    if (estAdmin) {
      const cellules = await this.prisma.cellule.findMany({
        where: { societeId },
        select: { id: true },
      });
      await Promise.all(cellules.map((c) => this.coquilleCellule(societeId, c.id)));
    } else {
      // La fiche donne la cellule. Exigée d'un collaborateur ; un rôle de
      // direction (Dir. GC, CFO…) sans fiche n'a pas de cellule : Général + DM.
      const collab = await this.prisma.collaborateur.findFirst({
        where: { utilisateurId: userId, societeId },
        select: { celluleId: true },
      });
      if (!collab && !estRoleBackOffice(acteur.role)) {
        throw new ForbiddenException('Aucune fiche collaborateur pour ce compte');
      }
      celluleId = collab?.celluleId ?? null;
      if (celluleId) await this.coquilleCellule(societeId, celluleId);
    }

    const where: Prisma.CanalWhereInput = estAdmin
      ? {
          societeId,
          OR: [
            { type: { in: [TypeCanal.general, TypeCanal.cellule] } },
            { type: TypeCanal.direct, participant1Id: userId },
            { type: TypeCanal.direct, participant2Id: userId },
          ],
        }
      : {
          societeId,
          OR: [
            { type: TypeCanal.general },
            ...(celluleId ? [{ type: TypeCanal.cellule, celluleId } as Prisma.CanalWhereInput] : []),
            { type: TypeCanal.direct, participant1Id: userId },
            { type: TypeCanal.direct, participant2Id: userId },
          ],
        };

    const canaux = await this.prisma.canal.findMany({ where, select: SELECT_CANAL });

    const lectures = await this.prisma.lectureCanal.findMany({
      where: { utilisateurId: userId, canalId: { in: canaux.map((c) => c.id) } },
      select: { canalId: true, dernierLuLe: true },
    });
    const lu = new Map(lectures.map((l) => [l.canalId, l.dernierLuLe]));

    const resumes = await Promise.all(
      canaux.map(async (c): Promise<CanalResume> => {
        const seuil = lu.get(c.id) ?? new Date(0);
        const [nonLus, dernier] = await Promise.all([
          this.prisma.message.count({
            where: {
              canalId: c.id,
              createdAt: { gt: seuil },
              auteurId: { not: userId },
            },
          }),
          this.prisma.message.findFirst({
            where: { canalId: c.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ]);
        return {
          id: c.id,
          type: c.type,
          nom: this.nomCanal(c, userId),
          nonLus,
          dernierMessageLe: dernier?.createdAt ?? null,
        };
      }),
    );

    // Non-lus d'abord, puis activité la plus récente.
    resumes.sort(
      (a, b) =>
        Number(b.nonLus > 0) - Number(a.nonLus > 0) ||
        (b.dernierMessageLe?.getTime() ?? 0) - (a.dernierMessageLe?.getTime() ?? 0),
    );
    return resumes;
  }

  // -- Messages d'un canal (pagination curseur) — accès déjà autorisé ----
  async messages(canalId: string, curseur?: string) {
    const lignes = await this.prisma.message.findMany({
      where: { canalId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
      select: {
        id: true,
        canalId: true,
        texte: true,
        createdAt: true,
        auteur: { select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } },
      },
    });
    const aPlus = lignes.length > PAGE;
    const page = aPlus ? lignes.slice(0, PAGE) : lignes;
    return {
      // du plus ancien au plus récent pour l'affichage direct
      messages: [...page].reverse().map(rendreMessage),
      curseurSuivant: aPlus ? page[page.length - 1].id : null,
    };
  }

  // -- Envoi ------------------------------------------------------------
  async envoyer(canalId: string, auteurId: string, texte: string): Promise<MessageRendu> {
    const propre = texte.trim();
    if (!propre) throw new BadRequestException('Message vide');

    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: {
        societeId: true,
        type: true,
        celluleId: true,
        participant1Id: true,
        participant2Id: true,
      },
    });
    if (!canal) throw new NotFoundException('Canal introuvable'); // AccesCanalGuard déjà passé — ceinture

    const message = await this.prisma.message.create({
      data: { canalId, auteurId, texte: propre },
      select: {
        id: true,
        canalId: true,
        texte: true,
        createdAt: true,
        auteur: { select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } },
      },
    });
    const rendu = rendreMessage(message);

    // Push temps réel vers les abonnés SSE autorisés sur ce canal.
    this.bus.publier({
      kind: 'message',
      societeId: canal.societeId,
      canalId,
      canalType: canal.type,
      celluleId: canal.celluleId,
      participant1Id: canal.participant1Id,
      participant2Id: canal.participant2Id,
      message: rendu,
    });
    return rendu;
  }

  // -- Marquer le canal lu -------------------------------------------
  async marquerLu(canalId: string, utilisateurId: string, societeId: string) {
    const maintenant = new Date();
    await this.prisma.lectureCanal.upsert({
      where: { utilisateurId_canalId: { utilisateurId, canalId } },
      create: { utilisateurId, canalId, dernierLuLe: maintenant },
      update: { dernierLuLe: maintenant },
    });
    // Resynchronise les autres connexions du lecteur (multi-onglet / device).
    this.bus.publier({
      kind: 'non_lus',
      societeId,
      destinataireId: utilisateurId,
      canalId,
      nonLus: 0,
    });
    return { nonLus: 0 };
  }

  // -- Annuaire : les personnes avec qui ouvrir un DM --------------------
  // Membres de la société ayant un compte, hors l'appelant et hors
  // holding_admin : les fiches collaborateur (libellé = métier), puis les
  // titulaires d'un rôle de back-office — societe_admin (« Administration »)
  // et rôles de la matrice (libellé = nom du rôle : CFO, Dir. GC…), même
  // règle d'appartenance qu'au login (rôle de la société ou transverse).
  async annuaire(acteur: Acteur) {
    const [collabs, direction] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId: acteur.societeId, utilisateurId: { not: null } },
        select: {
          utilisateurId: true,
          prenom: true,
          nom: true,
          role: true,
          cellule: { select: { nom: true } },
          utilisateur: { select: { nomAffiche: true, photoCle: true } },
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      this.prisma.utilisateurSocieteRole.findMany({
        where: {
          OR: [{ societeId: acteur.societeId }, { societeId: null }],
          role: { nom: { not: 'holding_admin' }, supprimeLe: null },
        },
        select: {
          utilisateur: { select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } },
          role: { select: { nom: true } },
        },
      }),
    ]);

    const parId = new Map<
      string,
      {
        utilisateurId: string;
        prenom: string;
        nom: string;
        nomAffiche: string | null;
        photoUrl: string | null;
        role: string;
        cellule: string | null;
      }
    >();
    for (const c of collabs) {
      if (c.utilisateurId && c.utilisateurId !== acteur.userId) {
        parId.set(c.utilisateurId, {
          utilisateurId: c.utilisateurId,
          prenom: c.prenom,
          nom: c.nom,
          nomAffiche: c.utilisateur?.nomAffiche ?? null,
          photoUrl: cheminPhoto(c.utilisateur?.photoCle),
          role: c.role,
          cellule: c.cellule?.nom ?? null,
        });
      }
    }
    for (const d of direction) {
      const u = d.utilisateur;
      if (u.id !== acteur.userId && !parId.has(u.id)) {
        parId.set(u.id, {
          utilisateurId: u.id,
          prenom: u.prenom,
          nom: u.nom,
          nomAffiche: u.nomAffiche,
          photoUrl: cheminPhoto(u.photoCle),
          role: d.role.nom === 'societe_admin' ? 'Administration' : d.role.nom,
          cellule: null,
        });
      }
    }
    return [...parId.values()].sort((x, y) => `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`));
  }

  // -- Ouvrir / récupérer un DM ------------------------------------
  async ouvrirDirect(acteur: Acteur, avecUtilisateurId: string): Promise<CanalResume> {
    if (avecUtilisateurId === acteur.userId) {
      throw new BadRequestException('Conversation avec soi-même impossible');
    }
    // Même règle d'appartenance que le login et l'annuaire (rôle transverse
    // compris — holding_admin, transverse lui aussi, est refusé juste après).
    const roles = await this.prisma.utilisateurSocieteRole.findMany({
      where: {
        utilisateurId: avecUtilisateurId,
        OR: [{ societeId: acteur.societeId }, { societeId: null }],
      },
      select: { role: { select: { nom: true } } },
    });
    if (roles.length === 0) {
      throw new NotFoundException("Cet utilisateur n'est pas membre de la société");
    }
    if (roles.some((r) => r.role.nom === 'holding_admin')) {
      throw new ForbiddenException('Conversation directe indisponible pour ce compte');
    }

    // Ordre canonique p1 < p2 → un seul DM par paire (@@unique).
    const [participant1Id, participant2Id] = [acteur.userId, avecUtilisateurId].sort();
    const canal = await this.prisma.canal.upsert({
      where: { participant1Id_participant2Id: { participant1Id, participant2Id } },
      create: {
        societeId: acteur.societeId,
        type: TypeCanal.direct,
        participant1Id,
        participant2Id,
      },
      update: {},
      select: SELECT_CANAL,
    });
    return {
      id: canal.id,
      type: canal.type,
      nom: this.nomCanal(canal, acteur.userId),
      nonLus: 0,
      dernierMessageLe: null,
    };
  }

  // -- Internes ---------------------------------------------------

  private nomCanal(c: CanalNommable, moi: string): string {
    if (c.type === TypeCanal.general) return 'Général';
    if (c.type === TypeCanal.cellule) return c.cellule?.nom ?? 'Cellule';
    const autre = c.participant1?.id === moi ? c.participant2 : c.participant1;
    return autre ? nomPublic(autre) : 'Conversation';
  }

  // Un seul Général par société ; l'index partiel garantit l'unicité même en
  // cas de course (on rattrape le P2002).
  private async coquilleGeneral(societeId: string) {
    const existant = await this.prisma.canal.findFirst({
      where: { societeId, type: TypeCanal.general },
      select: { id: true },
    });
    if (existant) return;
    try {
      await this.prisma.canal.create({
        data: { societeId, type: TypeCanal.general },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        throw e;
      }
    }
  }

  private async coquilleCellule(societeId: string, celluleId: string) {
    await this.prisma.canal.upsert({
      where: { celluleId },
      create: { societeId, type: TypeCanal.cellule, celluleId },
      update: {},
    });
  }
}

function rendreMessage(m: {
  id: string;
  canalId: string;
  texte: string;
  createdAt: Date;
  auteur: { id: string; prenom: string; nom: string; nomAffiche: string | null; photoCle: string | null };
}): MessageRendu {
  return {
    id: m.id,
    canalId: m.canalId,
    texte: m.texte,
    envoyeLe: m.createdAt,
    // Nom affiché (choisi par la personne) dans la conversation.
    auteur: { id: m.auteur.id, nom: nomPublic(m.auteur), photoUrl: cheminPhoto(m.auteur.photoCle) },
  };
}
