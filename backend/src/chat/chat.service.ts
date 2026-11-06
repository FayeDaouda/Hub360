import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TypeCanal } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { estRoleBackOffice } from '../commun/back-office.guard';
import { ChatBus } from './chat.bus';
import { cheminPhoto, nomPublic } from '../auth/profil';
import { ROLE_COMPANY_ADMIN, ROLE_DIR_GC, ROLE_HOLDING_ADMIN } from '@hub/domain';

type Acteur = { userId: string; societeId: string; role: string };

const PAGE = 50;
const MEMBRES_MAX = 50;
const DELAI_MODIFICATION_MS = 15 * 60_000;
// Réactions proposées sous un message.
export const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];
// Extrait d'un message dans une notification de mention.
const extrait = (texte: string) => (texte.length > 90 ? `${texte.slice(0, 89)}…` : texte);

export type CanalResume = {
  id: string;
  type: TypeCanal;
  nom: string;
  nonLus: number;
  dernierMessageLe: Date | null;
  // Groupe : qui l'a créé (il gère les membres) et combien ils sont.
  creeParId?: string | null;
  membres?: number;
};

export type MessageRendu = {
  id: string;
  canalId: string;
  texte: string;
  envoyeLe: Date;
  auteur: { id: string; nom: string; photoUrl: string | null };
  // Ligne d'information d'un groupe (« X a ajouté Y »).
  systeme: boolean;
  // Personnes mentionnées (@), avec leur nom pour les surligner.
  mentions: { id: string; nom: string }[];
  // Réponse à un message (son auteur et un extrait).
  reponseA: { id: string; auteur: string; extrait: string } | null;
  // Pièces jointes, sans leur contenu (téléchargées à la demande).
  pieces: { id: string; nom: string; taille: number; type: string }[];
  reactions: { emoji: string; ids: string[]; noms: string[] }[];
  modifieLe: Date | null;
  supprime: boolean;
};

type CanalNommable = {
  type: TypeCanal;
  nom: string | null;
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
  nom: true,
  creeParId: true,
  _count: { select: { membres: true } },
  cellule: { select: { nom: true } },
  participant1: { select: { id: true, prenom: true, nom: true, nomAffiche: true } },
  participant2: { select: { id: true, prenom: true, nom: true, nomAffiche: true } },
} satisfies Prisma.CanalSelect;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private bus: ChatBus,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  // -- Liste des canaux visibles + non-lus par canal ---------------------
  async listerCanaux(acteur: Acteur): Promise<CanalResume[]> {
    const { societeId, userId } = acteur;
    const estAdmin = acteur.role === ROLE_COMPANY_ADMIN;

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
            { type: { in: [TypeCanal.groupe, TypeCanal.projet] }, membres: { some: { utilisateurId: userId } } },
          ],
        }
      : {
          societeId,
          OR: [
            { type: TypeCanal.general },
            ...(celluleId ? [{ type: TypeCanal.cellule, celluleId } as Prisma.CanalWhereInput] : []),
            { type: TypeCanal.direct, participant1Id: userId },
            { type: TypeCanal.direct, participant2Id: userId },
            { type: { in: [TypeCanal.groupe, TypeCanal.projet] }, membres: { some: { utilisateurId: userId } } },
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
          ...((c.type === TypeCanal.groupe || c.type === TypeCanal.projet) && {
            creeParId: c.creeParId,
            membres: c._count.membres,
          }),
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
      select: SELECT_MESSAGE,
    });
    const aPlus = lignes.length > PAGE;
    const page = aPlus ? lignes.slice(0, PAGE) : lignes;
    const noms = await this.nomsDe(page.flatMap(idsCites));
    return {
      // du plus ancien au plus récent pour l'affichage direct
      messages: [...page].reverse().map((m) => rendreMessage(m, noms)),
      curseurSuivant: aPlus ? page[page.length - 1].id : null,
    };
  }

  // -- Envoi ------------------------------------------------------------
  // Texte et/ou pièces jointes ; réponse à un message du même canal ;
  // mentions (@personne, @tous hors « Général »). Les lecteurs absents
  // reçoivent une notification système (catégorie Messagerie).
  async envoyer(
    canalId: string,
    auteurId: string,
    texte: string,
    mentionIds: string[] = [],
    options: { reponseAId?: string; pieces?: { nom: string; url: string }[]; mentionTous?: boolean } = {},
  ): Promise<MessageRendu> {
    const propre = texte.trim();
    const pieces = options.pieces ?? [];
    if (!propre && !pieces.length) throw new BadRequestException('Message vide');

    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: { societeId: true, type: true, societe: { select: { slug: true } } },
    });
    if (!canal) throw new NotFoundException('Canal introuvable'); // AccesCanalGuard déjà passé — ceinture
    if (options.reponseAId) {
      const cible = await this.prisma.message.findFirst({
        where: { id: options.reponseAId, canalId },
        select: { id: true },
      });
      if (!cible) throw new BadRequestException('Le message cité n’est pas dans cette conversation.');
    }

    const lecteurs = (await this.mentionnables(canalId)).map((p) => p.id);
    // @tous : chaque lecteur, sauf dans « Général » (toute la société).
    const tous = !!options.mentionTous && canal.type !== TypeCanal.general;
    const mentions = (tous ? lecteurs : [...new Set(mentionIds)].filter((id) => lecteurs.includes(id))).filter(
      (id) => id !== auteurId,
    );

    const message = await this.prisma.message.create({
      data: {
        canalId,
        auteurId,
        texte: propre,
        mentions,
        reponseAId: options.reponseAId ?? null,
        pieces: {
          create: pieces.map((p) => ({
            nom: p.nom.trim().slice(0, 200),
            url: p.url,
            taille: Math.floor((p.url.length - p.url.indexOf(',') - 1) * 0.75),
            type: p.url.slice(5, p.url.indexOf(';')) || 'application/octet-stream',
          })),
        },
      },
      select: SELECT_MESSAGE,
    });
    const rendu = rendreMessage(message, await this.nomsDe(idsCites(message)));
    await this.publierCanal(canalId, 'message', { message: rendu });

    const nomCanal = await this.nomDuCanal(canalId, auteurId);
    const apercu = propre ? extrait(propre) : `📎 ${pieces.map((p) => p.nom).join(', ')}`;
    // La personne mentionnée est prévenue (cloche, pop-up) ; le clic ouvre la conversation.
    if (mentions.length) {
      await this.notifications.envoyer({
        societeId: canal.societeId,
        type: 'mention_chat',
        titre: `${rendu.auteur.nom} ${tous ? 'a prévenu tout le monde' : 'vous a mentionné'} · ${nomCanal} : « ${apercu} »`,
        destinataireIds: mentions,
        parId: auteurId,
        canalId,
      });
    }
    // Les autres lecteurs : notification système seulement (pas de cloche par message).
    const autres = lecteurs.filter((id) => id !== auteurId && !mentions.includes(id));
    await this.push.envoyer(
      autres,
      {
        titre: `${rendu.auteur.nom} · ${nomCanal}`,
        corps: apercu,
        url: `/admin/${canal.societe.slug}?conversation=${canalId}`,
        tag: `canal-${canalId}`,
      },
      'messagerie',
    );
    return rendu;
  }

  // Son auteur modifie ou supprime un message pendant 15 minutes.
  async modifier(acteur: Acteur, canalId: string, messageId: string, texte: string) {
    const m = await this.messageModifiable(acteur, canalId, messageId);
    const propre = texte.trim();
    if (!propre && !m._count.pieces) throw new BadRequestException('Message vide');
    const maj = await this.prisma.message.update({
      where: { id: m.id },
      data: { texte: propre, modifieLe: new Date() },
      select: SELECT_MESSAGE,
    });
    const rendu = rendreMessage(maj, await this.nomsDe(idsCites(maj)));
    await this.publierCanal(canalId, 'message_modifie', { message: rendu });
    return rendu;
  }

  async supprimer(acteur: Acteur, canalId: string, messageId: string) {
    const m = await this.messageModifiable(acteur, canalId, messageId);
    await this.prisma.pieceMessage.deleteMany({ where: { messageId: m.id } });
    const maj = await this.prisma.message.update({
      where: { id: m.id },
      data: { texte: '', mentions: [], supprimeLe: new Date() },
      select: SELECT_MESSAGE,
    });
    const rendu = rendreMessage(maj, new Map());
    await this.publierCanal(canalId, 'message_modifie', { message: rendu });
    return rendu;
  }

  // Réaction : ajoutée, ou retirée si on l'avait déjà mise.
  async reagir(acteur: Acteur, canalId: string, messageId: string, emoji: string) {
    if (!EMOJIS.includes(emoji)) throw new BadRequestException('Réaction inconnue.');
    const m = await this.prisma.message.findFirst({
      where: { id: messageId, canalId, supprimeLe: null, systeme: false },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Message introuvable');
    const cle = { messageId_utilisateurId_emoji: { messageId, utilisateurId: acteur.userId, emoji } };
    const deja = await this.prisma.reactionMessage.findUnique({ where: cle });
    if (deja) await this.prisma.reactionMessage.delete({ where: cle });
    else await this.prisma.reactionMessage.create({ data: { messageId, utilisateurId: acteur.userId, emoji } });
    const reactions = await this.reactionsDe(messageId);
    await this.publierCanal(canalId, 'reactions', { messageId, reactions });
    return reactions;
  }

  async piece(canalId: string, messageId: string, pieceId: string) {
    const p = await this.prisma.pieceMessage.findFirst({
      where: { id: pieceId, messageId, message: { canalId } },
      select: { nom: true, url: true, type: true },
    });
    if (!p) throw new NotFoundException('Pièce introuvable');
    return p;
  }

  // « En train d'écrire… » : diffusé aux autres lecteurs, sans rien stocker.
  async frappe(acteur: Acteur, canalId: string) {
    const noms = await this.nomsDe([acteur.userId]);
    await this.publierCanal(
      canalId,
      'frappe',
      { utilisateurId: acteur.userId, nom: noms.get(acteur.userId) },
      acteur.userId,
    );
    return { ok: true };
  }

  // Lectures (« vu par ») : jusqu'où chacun a lu la conversation.
  async lectures(canalId: string) {
    const l = await this.prisma.lectureCanal.findMany({
      where: { canalId },
      select: {
        dernierLuLe: true,
        utilisateur: { select: { id: true, prenom: true, nom: true, nomAffiche: true } },
      },
    });
    return l.map((x) => ({ utilisateurId: x.utilisateur.id, nom: nomPublic(x.utilisateur), luLe: x.dernierLuLe }));
  }

  // Recherche dans les conversations qu'on lit (30 résultats, les plus récents).
  async rechercher(acteur: Acteur, q: string) {
    const terme = q.trim();
    if (terme.length < 2) return [];
    const canaux = await this.listerCanaux(acteur);
    const noms = new Map(canaux.map((c) => [c.id, c.nom]));
    const lignes = await this.prisma.message.findMany({
      where: {
        canalId: { in: canaux.map((c) => c.id) },
        supprimeLe: null,
        systeme: false,
        texte: { contains: terme, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        canalId: true,
        texte: true,
        createdAt: true,
        auteur: { select: { prenom: true, nom: true, nomAffiche: true } },
      },
    });
    return lignes.map((m) => ({
      id: m.id,
      canalId: m.canalId,
      canal: noms.get(m.canalId) ?? 'Conversation',
      auteur: nomPublic(m.auteur),
      texte: m.texte,
      envoyeLe: m.createdAt,
    }));
  }

  // -- Conversation d'un projet (02/11/2026) -------------------------------
  // Une par projet, ses membres tenus à jour automatiquement : les équipes
  // du projet, les personnes assignées à ses tâches et la direction de la
  // conception (Dir. GC). Appelée à l'ouverture du projet, quand ses équipes
  // ou ses assignations changent, et quand on ouvre la discussion.
  async synchroniserCanalProjet(projetId: string): Promise<string | null> {
    const projet = await this.prisma.projet.findUnique({
      where: { id: projetId },
      select: {
        id: true,
        societeId: true,
        code: true,
        ouvertLe: true,
        client: { select: { nom: true } },
        cellules: { select: { celluleId: true } },
        canal: { select: { id: true } },
      },
    });
    if (!projet?.ouvertLe) return null;
    const celluleIds = projet.cellules.map((c) => c.celluleId);
    const [collabs, assignes, direction] = await Promise.all([
      this.prisma.collaborateur.findMany({
        where: { societeId: projet.societeId, celluleId: { in: celluleIds }, utilisateurId: { not: null } },
        select: { utilisateurId: true },
      }),
      this.prisma.tacheProjet.findMany({
        where: { projetId, assigneId: { not: null } },
        select: { assigne: { select: { utilisateurId: true } } },
      }),
      this.prisma.utilisateurSocieteRole.findMany({
        where: {
          societeId: projet.societeId,
          role: { nom: ROLE_DIR_GC, supprimeLe: null },
          utilisateur: { actif: true },
        },
        select: { utilisateurId: true },
      }),
    ]);
    const voulus = new Set(
      [
        ...collabs.map((c) => c.utilisateurId),
        ...assignes.map((a) => a.assigne?.utilisateurId),
        ...direction.map((d) => d.utilisateurId),
      ].filter((x): x is string => !!x),
    );
    const canalId =
      projet.canal?.id ??
      (
        await this.prisma.canal.create({
          data: {
            societeId: projet.societeId,
            type: TypeCanal.projet,
            projetId,
            nom: `${projet.code} · ${projet.client.nom}`.slice(0, 80),
          },
          select: { id: true },
        })
      ).id;
    const actuels = new Set(
      (await this.prisma.membreCanal.findMany({ where: { canalId }, select: { utilisateurId: true } })).map(
        (m) => m.utilisateurId,
      ),
    );
    const ajouts = [...voulus].filter((id) => !actuels.has(id));
    const retraits = [...actuels].filter((id) => !voulus.has(id));
    if (ajouts.length) {
      await this.prisma.membreCanal.createMany({
        data: ajouts.map((utilisateurId) => ({ canalId, utilisateurId })),
        skipDuplicates: true,
      });
    }
    if (retraits.length)
      await this.prisma.membreCanal.deleteMany({ where: { canalId, utilisateurId: { in: retraits } } });
    return canalId;
  }

  // « Discussion du projet » (fiche du projet) : tenue à jour puis ouverte —
  // seulement pour qui en fait partie.
  async ouvrirCanalProjet(acteur: Acteur, projetId: string) {
    const projet = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId: acteur.societeId, ouvertLe: { not: null } },
      select: { id: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const canalId = await this.synchroniserCanalProjet(projetId);
    const membre =
      canalId &&
      (await this.prisma.membreCanal.findUnique({
        where: { canalId_utilisateurId: { canalId, utilisateurId: acteur.userId } },
        select: { canalId: true },
      }));
    if (!membre) {
      throw new ForbiddenException(
        'La discussion réunit les équipes du projet, les personnes assignées et la direction.',
      );
    }
    return { canalId };
  }

  // Événement d'une conversation vers ses lecteurs connectés (SSE).
  private async publierCanal(
    canalId: string,
    kind: 'message' | 'message_modifie' | 'reactions' | 'frappe' | 'lecture',
    data: Record<string, unknown>,
    parId?: string,
  ) {
    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: {
        societeId: true,
        type: true,
        celluleId: true,
        participant1Id: true,
        participant2Id: true,
        membres: { select: { utilisateurId: true } },
      },
    });
    if (!canal) return;
    this.bus.publier({
      kind,
      societeId: canal.societeId,
      canalId,
      canalType: canal.type,
      celluleId: canal.celluleId,
      participant1Id: canal.participant1Id,
      participant2Id: canal.participant2Id,
      membreIds: canal.membres.map((m) => m.utilisateurId),
      parId,
      data,
    });
  }

  private async messageModifiable(acteur: Acteur, canalId: string, messageId: string) {
    const m = await this.prisma.message.findFirst({
      where: { id: messageId, canalId },
      select: {
        id: true,
        auteurId: true,
        systeme: true,
        supprimeLe: true,
        createdAt: true,
        _count: { select: { pieces: true } },
      },
    });
    if (!m || m.systeme || m.supprimeLe) throw new NotFoundException('Message introuvable');
    if (m.auteurId !== acteur.userId) throw new ForbiddenException('Seul son auteur modifie un message.');
    if (Date.now() - m.createdAt.getTime() > DELAI_MODIFICATION_MS) {
      throw new ForbiddenException('Un message se modifie ou se supprime dans les 15 minutes qui suivent son envoi.');
    }
    return m;
  }

  private async reactionsDe(messageId: string) {
    const r = await this.prisma.reactionMessage.findMany({
      where: { messageId },
      select: { emoji: true, utilisateur: { select: { id: true, prenom: true, nom: true, nomAffiche: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return regrouperReactions(r);
  }

  // -- Groupes de discussion (01/11/2026) ---------------------------------
  // Créés par n'importe quel membre de la société qui participe au chat ;
  // le créateur gère le groupe (nom, retrait d'un membre) ; tout membre peut
  // en ajouter et quitter le groupe. Accès réservé aux membres.
  async creerGroupe(acteur: Acteur, nom: string, membreIds: string[]): Promise<CanalResume> {
    const propre = nom.trim();
    if (propre.length < 2) throw new BadRequestException('Nom du groupe : 2 caractères au moins.');
    const autres = await this.membresValides(acteur, membreIds);
    if (!autres.length) throw new BadRequestException('Ajoutez au moins une personne au groupe.');
    const canal = await this.prisma.canal.create({
      data: {
        societeId: acteur.societeId,
        type: TypeCanal.groupe,
        nom: propre.slice(0, 80),
        creeParId: acteur.userId,
        membres: { create: [acteur.userId, ...autres].map((utilisateurId) => ({ utilisateurId })) },
      },
      select: SELECT_CANAL,
    });
    const noms = await this.nomsDe([acteur.userId, ...autres]);
    await this.ligneSysteme(canal.id, acteur.userId, `${noms.get(acteur.userId)} a créé le groupe « ${propre} »`);
    await this.notifications.envoyer({
      societeId: acteur.societeId,
      type: 'groupe_chat',
      titre: `${noms.get(acteur.userId)} vous a ajouté au groupe « ${propre} »`,
      destinataireIds: autres,
      parId: acteur.userId,
      canalId: canal.id,
    });
    return {
      id: canal.id,
      type: canal.type,
      nom: propre,
      nonLus: 0,
      dernierMessageLe: new Date(),
      creeParId: acteur.userId,
      membres: autres.length + 1,
    };
  }

  async membresGroupe(canalId: string) {
    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: { type: true, creeParId: true },
    });
    if (!canal || (canal.type !== TypeCanal.groupe && canal.type !== TypeCanal.projet)) {
      throw new NotFoundException('Groupe introuvable');
    }
    const membres = await this.prisma.membreCanal.findMany({
      where: { canalId },
      select: {
        utilisateur: { select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } },
      },
      orderBy: { ajouteLe: 'asc' },
    });
    return membres.map((m) => ({
      id: m.utilisateur.id,
      nom: nomPublic(m.utilisateur),
      photoUrl: cheminPhoto(m.utilisateur.photoCle),
      createur: m.utilisateur.id === canal.creeParId,
    }));
  }

  async ajouterMembres(acteur: Acteur, canalId: string, membreIds: string[]) {
    const canal = await this.groupe(canalId);
    const deja = new Set(
      (await this.prisma.membreCanal.findMany({ where: { canalId }, select: { utilisateurId: true } })).map(
        (m) => m.utilisateurId,
      ),
    );
    const nouveaux = (await this.membresValides(acteur, membreIds)).filter((id) => !deja.has(id));
    if (!nouveaux.length) throw new BadRequestException('Ces personnes sont déjà dans le groupe.');
    if (deja.size + nouveaux.length > MEMBRES_MAX) throw new BadRequestException(`${MEMBRES_MAX} membres au plus.`);
    await this.prisma.membreCanal.createMany({ data: nouveaux.map((utilisateurId) => ({ canalId, utilisateurId })) });
    const noms = await this.nomsDe([acteur.userId, ...nouveaux]);
    await this.ligneSysteme(
      canalId,
      acteur.userId,
      `${noms.get(acteur.userId)} a ajouté ${nouveaux.map((id) => noms.get(id)).join(', ')}`,
    );
    await this.notifications.envoyer({
      societeId: acteur.societeId,
      type: 'groupe_chat',
      titre: `${noms.get(acteur.userId)} vous a ajouté au groupe « ${canal.nom} »`,
      destinataireIds: nouveaux,
      parId: acteur.userId,
      canalId,
    });
    return this.membresGroupe(canalId);
  }

  // Le créateur retire un membre ; chacun peut se retirer lui-même (quitter).
  // Le créateur qui part passe la main au membre le plus ancien ; un groupe
  // vide est supprimé.
  async retirerMembre(acteur: Acteur, canalId: string, utilisateurId: string) {
    const canal = await this.groupe(canalId);
    const soi = utilisateurId === acteur.userId;
    if (!soi && canal.creeParId !== acteur.userId) {
      throw new ForbiddenException('Seul le créateur du groupe retire un membre.');
    }
    const { count } = await this.prisma.membreCanal.deleteMany({ where: { canalId, utilisateurId } });
    if (!count) throw new NotFoundException('Cette personne n’est pas dans le groupe.');
    const restants = await this.prisma.membreCanal.findMany({ where: { canalId }, orderBy: { ajouteLe: 'asc' } });
    if (!restants.length) {
      await this.prisma.canal.delete({ where: { id: canalId } });
      return { ok: true };
    }
    if (canal.creeParId === utilisateurId) {
      await this.prisma.canal.update({ where: { id: canalId }, data: { creeParId: restants[0].utilisateurId } });
    }
    const noms = await this.nomsDe([acteur.userId, utilisateurId]);
    await this.ligneSysteme(
      canalId,
      acteur.userId,
      soi
        ? `${noms.get(acteur.userId)} a quitté le groupe`
        : `${noms.get(acteur.userId)} a retiré ${noms.get(utilisateurId)}`,
    );
    return { ok: true };
  }

  async renommerGroupe(acteur: Acteur, canalId: string, nom: string) {
    const canal = await this.groupe(canalId);
    if (canal.creeParId !== acteur.userId) throw new ForbiddenException('Seul le créateur du groupe le renomme.');
    const propre = nom.trim().slice(0, 80);
    if (propre.length < 2) throw new BadRequestException('Nom du groupe : 2 caractères au moins.');
    await this.prisma.canal.update({ where: { id: canalId }, data: { nom: propre } });
    const noms = await this.nomsDe([acteur.userId]);
    await this.ligneSysteme(canalId, acteur.userId, `${noms.get(acteur.userId)} a renommé le groupe « ${propre} »`);
    return { ok: true };
  }

  // Personnes qu'on peut mentionner (@) dans une conversation : celles qui la lisent.
  async mentionnables(canalId: string) {
    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: {
        societeId: true,
        type: true,
        celluleId: true,
        participant1Id: true,
        participant2Id: true,
        membres: { select: { utilisateurId: true } },
      },
    });
    if (!canal) throw new NotFoundException('Canal introuvable');
    let ids: string[];
    if (canal.type === TypeCanal.direct)
      ids = [canal.participant1Id, canal.participant2Id].filter((x): x is string => !!x);
    else if (canal.type === TypeCanal.groupe || canal.type === TypeCanal.projet)
      ids = canal.membres.map((m) => m.utilisateurId);
    else if (canal.type === TypeCanal.cellule) {
      const [collabs, admins] = await Promise.all([
        this.prisma.collaborateur.findMany({
          where: { societeId: canal.societeId, celluleId: canal.celluleId, utilisateurId: { not: null } },
          select: { utilisateurId: true },
        }),
        this.prisma.utilisateurSocieteRole.findMany({
          where: { societeId: canal.societeId, role: { nom: ROLE_COMPANY_ADMIN } },
          select: { utilisateurId: true },
        }),
      ]);
      ids = [...collabs.map((c) => c.utilisateurId!), ...admins.map((a) => a.utilisateurId)];
    } else {
      ids = (await this.membresSociete(canal.societeId)).map((u) => u.id);
    }
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(ids)] }, actif: true },
      select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true },
    });
    return u
      .map((x) => ({ id: x.id, nom: nomPublic(x), photoUrl: cheminPhoto(x.photoCle) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  // -- Marquer le canal lu -------------------------------------------
  async marquerLu(canalId: string, utilisateurId: string, societeId: string) {
    const maintenant = new Date();
    await this.prisma.lectureCanal.upsert({
      where: { utilisateurId_canalId: { utilisateurId, canalId } },
      create: { utilisateurId, canalId, dernierLuLe: maintenant },
      update: { dernierLuLe: maintenant },
    });
    // « Vu par » : les autres lecteurs voient jusqu'où il a lu.
    const noms = await this.nomsDe([utilisateurId]);
    await this.publierCanal(canalId, 'lecture', { utilisateurId, nom: noms.get(utilisateurId), luLe: maintenant });
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
          role: { nom: { not: ROLE_HOLDING_ADMIN }, supprimeLe: null },
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
          role: d.role.nom === ROLE_COMPANY_ADMIN ? 'Administration' : d.role.nom,
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
    if (roles.some((r) => r.role.nom === ROLE_HOLDING_ADMIN)) {
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
    if (c.type === TypeCanal.groupe) return c.nom ?? 'Groupe';
    if (c.type === TypeCanal.projet) return c.nom ?? 'Projet';
    const autre = c.participant1?.id === moi ? c.participant2 : c.participant1;
    return autre ? nomPublic(autre) : 'Conversation';
  }

  private async groupe(canalId: string) {
    const canal = await this.prisma.canal.findUnique({
      where: { id: canalId },
      select: { id: true, type: true, nom: true, creeParId: true },
    });
    if (!canal || canal.type !== TypeCanal.groupe) throw new NotFoundException('Groupe introuvable');
    return canal;
  }

  private async nomDuCanal(canalId: string, moi: string) {
    const c = await this.prisma.canal.findUnique({ where: { id: canalId }, select: SELECT_CANAL });
    return c ? this.nomCanal(c, moi) : 'Conversation';
  }

  // Membres proposables pour un groupe : même règle que l'annuaire (membres de
  // la société, hors holding_admin), sans l'appelant.
  private async membresValides(acteur: Acteur, ids: string[]) {
    const autorises = new Set((await this.annuaire(acteur)).map((m) => m.utilisateurId));
    const valides = [...new Set(ids)].filter((id) => autorises.has(id));
    if (valides.length !== new Set(ids.filter((id) => id !== acteur.userId)).size) {
      throw new BadRequestException('Une des personnes choisies n’est pas membre de la société.');
    }
    if (valides.length + 1 > MEMBRES_MAX) throw new BadRequestException(`${MEMBRES_MAX} membres au plus.`);
    return valides;
  }

  private async membresSociete(societeId: string) {
    const l = await this.prisma.utilisateurSocieteRole.findMany({
      where: { OR: [{ societeId }, { societeId: null }], role: { nom: { not: ROLE_HOLDING_ADMIN }, supprimeLe: null } },
      select: { utilisateur: { select: { id: true } } },
    });
    return l.map((x) => x.utilisateur);
  }

  private async nomsDe(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const u = await this.prisma.utilisateur.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, prenom: true, nom: true, nomAffiche: true },
    });
    return new Map(u.map((x) => [x.id, nomPublic(x)]));
  }

  // Ligne d'information du groupe, diffusée comme un message.
  private async ligneSysteme(canalId: string, auteurId: string, texte: string) {
    const m = await this.prisma.message.create({
      data: { canalId, auteurId, texte, systeme: true },
      select: SELECT_MESSAGE,
    });
    await this.publierCanal(canalId, 'message', { message: rendreMessage(m, new Map()) });
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

const SELECT_MESSAGE = {
  id: true,
  canalId: true,
  texte: true,
  systeme: true,
  mentions: true,
  modifieLe: true,
  supprimeLe: true,
  createdAt: true,
  auteur: { select: { id: true, prenom: true, nom: true, nomAffiche: true, photoCle: true } },
  reponseA: {
    select: {
      id: true,
      texte: true,
      supprimeLe: true,
      auteur: { select: { prenom: true, nom: true, nomAffiche: true } },
    },
  },
  pieces: { select: { id: true, nom: true, taille: true, type: true } },
  reactions: {
    select: { emoji: true, utilisateur: { select: { id: true, prenom: true, nom: true, nomAffiche: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MessageSelect;

type MessageLu = Prisma.MessageGetPayload<{ select: typeof SELECT_MESSAGE }>;

// Comptes dont on affiche le nom : les mentions.
const idsCites = (m: MessageLu) => m.mentions;

function regrouperReactions(
  r: { emoji: string; utilisateur: { id: string; prenom: string; nom: string; nomAffiche: string | null } }[],
) {
  const parEmoji = new Map<string, { emoji: string; ids: string[]; noms: string[] }>();
  for (const x of r) {
    const g = parEmoji.get(x.emoji) ?? { emoji: x.emoji, ids: [], noms: [] };
    g.ids.push(x.utilisateur.id);
    g.noms.push(nomPublic(x.utilisateur));
    parEmoji.set(x.emoji, g);
  }
  return [...parEmoji.values()];
}

function rendreMessage(m: MessageLu, noms: Map<string, string>): MessageRendu {
  const supprime = !!m.supprimeLe;
  return {
    id: m.id,
    canalId: m.canalId,
    texte: supprime ? '' : m.texte,
    envoyeLe: m.createdAt,
    // Nom affiché (choisi par la personne) dans la conversation.
    auteur: { id: m.auteur.id, nom: nomPublic(m.auteur), photoUrl: cheminPhoto(m.auteur.photoCle) },
    systeme: m.systeme,
    mentions: supprime ? [] : m.mentions.map((id) => ({ id, nom: noms.get(id) ?? '' })).filter((x) => x.nom),
    reponseA: m.reponseA
      ? {
          id: m.reponseA.id,
          auteur: nomPublic(m.reponseA.auteur),
          extrait: m.reponseA.supprimeLe ? 'Message supprimé' : extrait(m.reponseA.texte || '📎 Pièce jointe'),
        }
      : null,
    pieces: supprime ? [] : m.pieces,
    reactions: supprime ? [] : regrouperReactions(m.reactions),
    modifieLe: m.modifieLe,
    supprime,
  };
}
