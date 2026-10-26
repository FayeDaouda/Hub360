import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionPaie, Prisma, TypePieceDossier } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { salaireAu } from './regles-salaire';
import { DossierPersonnelDto, PieceDto, ReaffectationDto } from './dto';
import { todayIso } from '../shared/dates';

// Pièces attendues dans tout dossier (ordre d'affichage).
export const PIECES_DOSSIER: TypePieceDossier[] = [
  'piece_identite',
  'cv',
  'diplomes',
  'contrat_signe',
  'fiche_poste',
  'rib_ou_attestation',
  'certificat_residence',
  'photo_identite',
  'carte_ipm',
];

// Champs comptés dans la complétude (la date de fin seulement hors CDI). La
// carte de mission n'y entre pas : elle ne concerne que les nouveaux arrivants.
const CHAMPS_TEXTE = [
  'poste',
  'prenom',
  'nom',
  'lieuNaissance',
  'nationalite',
  'numeroPiece',
  'telephone',
  'emailPro',
  'contactUrgence',
  'coordonneesPaiement',
  'numeroIpm',
] as const;

// Détail du journal de compte qui marque une désactivation par départ (sert
// à savoir si le désarchivage peut réactiver le compte).
const MOTIF_ARCHIVAGE = 'Dossier RH archivé (départ)';

const COMPTE = { select: { id: true, prenom: true, nom: true, email: true } } as const;
const INCLURE = {
  societe: { select: { id: true, nom: true, slug: true } },
  collaborateur: { select: { id: true, cellule: { select: { nom: true } }, utilisateur: COMPTE } },
  utilisateur: COMPTE,
  pieces: { select: { type: true, nom: true, createdAt: true } },
  bulletins: { select: { mois: true, nom: true, updatedAt: true }, orderBy: { mois: 'desc' } },
  // Statuts seulement : aucun montant ne part avec le dossier.
  salaires: { select: { statut: true } },
} satisfies Prisma.DossierPersonnelInclude;
type DossierLu = Prisma.DossierPersonnelGetPayload<{ include: typeof INCLURE }>;

export function completude(d: DossierLu): { pourcentage: number; manquants: number } {
  const remplis = [
    ...CHAMPS_TEXTE.map((c) => d[c].trim() !== ''),
    d.dateEntree !== null,
    d.dateNaissance !== null,
    d.salaires.some((s) => s.statut === 'valide'),
    ...(d.typeContrat === 'cdi' ? [] : [d.dateFin !== null]),
    ...PIECES_DOSSIER.map((t) => d.pieces.some((p) => p.type === t)),
  ];
  const faits = remplis.filter(Boolean).length;
  return { pourcentage: Math.round((faits / remplis.length) * 100), manquants: remplis.length - faits };
}

function versDossier(d: DossierLu) {
  const {
    societe,
    collaborateur,
    utilisateur,
    pieces,
    bulletins,
    salaires,
    archiveParId: _a,
    creeParId: _c,
    ...champs
  } = d;
  // Compte qui ouvre « Mon espace » : celui de la fiche d'équipe s'il y en a
  // une, sinon le compte relié directement au dossier.
  const compte = collaborateur?.utilisateur ?? utilisateur;
  return {
    ...champs,
    societe,
    cellule: collaborateur?.cellule?.nom ?? null,
    compte: compte
      ? {
          id: compte.id,
          libelle: `${compte.prenom} ${compte.nom}`.trim(),
          email: compte.email,
          viaFiche: !!collaborateur?.utilisateur,
        }
      : null,
    pieces: PIECES_DOSSIER.map((type) => {
      const p = pieces.find((x) => x.type === type);
      return { type, nom: p?.nom ?? null, ajouteLe: p?.createdAt ?? null };
    }),
    completude: completude(d),
    bulletins: bulletins.map((b) => ({ mois: b.mois, nom: b.nom, deposeLe: b.updatedAt })),
    // Le salaire ne part jamais avec le dossier : il s'affiche à la demande
    // (GET …/salaire, historique), et chaque affichage est tracé (journal de la paie).
    salaireRenseigne: salaires.some((s) => s.statut === 'valide'),
    salaireEnAttente: salaires.some((s) => s.statut === 'a_valider'),
  };
}

@Injectable()
export class DossiersPersonnelService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Tout le groupe (les trois sociétés) : c'est le périmètre du module RH.
  async lister() {
    const dossiers = await this.prisma.dossierPersonnel.findMany({
      include: INCLURE,
      orderBy: { matricule: 'asc' },
    });
    return dossiers.map(versDossier);
  }

  async detail(id: string) {
    return versDossier(await this.charger(id));
  }

  // --- Paie : affichage tracé, masse salariale agrégée (revue RH 20/10/2026) ---
  private tracer(dossierId: string, action: ActionPaie, parId: string, mois?: string) {
    return this.prisma.journalPaie.create({ data: { dossierId, action, parId, mois: mois ?? null } });
  }

  // Total des dossiers actifs, salaires en vigueur aujourd'hui : un agrégat,
  // pas la paie d'une personne.
  async masseSalariale() {
    const jour = todayIso();
    const actifs = await this.prisma.dossierPersonnel.findMany({
      where: { archiveLe: null },
      select: {
        salaires: {
          where: { statut: 'valide' },
          select: { montant: true, dateEffet: true, statut: true, decideLe: true },
        },
      },
    });
    const salaires = actifs.map((d) => salaireAu(d.salaires, jour)).filter((s): s is number => s !== null);
    return { masse: salaires.reduce((t, s) => t + s, 0), renseignes: salaires.length, total: actifs.length };
  }

  // Liens de la pièce (data URI) : à part, pour ne pas alourdir la liste.
  async piece(id: string, type: TypePieceDossier) {
    const p = await this.prisma.pieceDossierPersonnel.findUnique({
      where: { dossierId_type: { dossierId: id, type } },
      select: { nom: true, cle: true },
    });
    if (!p) throw new NotFoundException('Pièce absente');
    return { nom: p.nom, url: p.cle };
  }

  async options() {
    const [societes, collaborateurs, comptes] = await Promise.all([
      this.prisma.societe.findMany({
        where: { actif: true, accesOuvert: true },
        select: { id: true, nom: true },
        orderBy: { nom: 'asc' },
      }),
      this.prisma.collaborateur.findMany({
        where: { dossierPersonnel: null },
        select: { id: true, prenom: true, nom: true, societeId: true, cellule: { select: { nom: true } } },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
      // Comptes reliables directement : sans fiche d'équipe (sinon le lien
      // passe par la fiche) et sans dossier.
      this.prisma.utilisateur.findMany({
        where: { collaborations: { none: {} }, dossierPersonnel: null },
        select: { id: true, prenom: true, nom: true, email: true },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
    ]);
    return {
      societes,
      comptesSansDossier: comptes.map((u) => ({ id: u.id, libelle: `${u.prenom} ${u.nom}`.trim(), email: u.email })),
      collaborateursSansDossier: collaborateurs.map((c) => ({
        id: c.id,
        libelle: `${c.prenom} ${c.nom}`,
        societeId: c.societeId,
        cellule: c.cellule?.nom ?? null,
      })),
    };
  }

  async creer(dto: DossierPersonnelDto, acteurId: string) {
    if (!dto.societeId) throw new BadRequestException('La société est obligatoire.');
    const data = await this.valider(dto, null);
    for (let essai = 0; essai < 3; essai++) {
      try {
        const cree = await this.prisma.dossierPersonnel.create({
          data: { ...data, societeId: dto.societeId, matricule: await this.prochainMatricule(), creeParId: acteurId },
          include: INCLURE,
        });
        return versDossier(cree);
      } catch (e) {
        // Deux créations simultanées : même matricule calculé → on recalcule.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('Matricule indisponible — réessayez.');
  }

  async maj(id: string, dto: DossierPersonnelDto, acteurId: string) {
    await this.charger(id);
    const data = await this.valider(dto, id);
    const d = await this.prisma.dossierPersonnel.update({ where: { id }, data, include: INCLURE });
    return versDossier(d);
  }

  // Changement de moyen de paiement demandé dans « Mon espace » : validé, il
  // remplace celui de la paie ; refusé, il est simplement retiré.
  async deciderPaiement(id: string, valide: boolean) {
    const d = await this.charger(id);
    if (!d.paiementDemandeMode) throw new ConflictException('Aucun changement de moyen de paiement en attente.');
    const maj = await this.prisma.dossierPersonnel.update({
      where: { id },
      data: {
        ...(valide && { modePaiement: d.paiementDemandeMode, coordonneesPaiement: d.paiementDemandeCoordonnees ?? '' }),
        paiementDemandeMode: null,
        paiementDemandeCoordonnees: null,
        paiementDemandeLe: null,
      },
      include: INCLURE,
    });
    return versDossier(maj);
  }

  // Départ : archivé, jamais supprimé ; réversible.
  // Le départ coupe aussi l'accès au HUB : compte désactivé + sessions
  // révoquées. Le désarchivage ne réactive que si c'est l'archivage qui avait
  // coupé le compte (dernier événement du journal) — un compte désactivé pour
  // une autre raison reste coupé.
  async archiver(id: string, archive: boolean, acteurId: string, reaffectations: ReaffectationDto[] = []) {
    const actuel = await this.charger(id);
    const utilisateurId = actuel.utilisateurId ?? actuel.collaborateur?.utilisateur?.id ?? null;
    if (archive && utilisateurId === acteurId) {
      throw new BadRequestException('Vous ne pouvez pas archiver votre propre dossier.');
    }
    const maintenant = new Date();
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    // Départ : chaque tâche de projet encore ouverte change de main, sans
    // exception — personne ne garde une tâche au nom d'un salarié parti.
    const confiees: { tacheId: string; projetId: string; societeId: string; titre: string; cible: string }[] = [];
    if (archive) {
      const { taches, candidats } = await this.tachesOuvertes(id);
      const noms = new Map(candidats.map((c) => [c.id, c.nom]));
      const cibles = new Map(reaffectations.map((r) => [r.tacheId, r.collaborateurId]));
      for (const t of taches) {
        const cible = cibles.get(t.id);
        if (!cible || !noms.has(cible))
          throw new BadRequestException(`Tâche à réaffecter : ${t.projet} · ${t.carte} · ${t.libelle}.`);
        ops.push(
          this.prisma.tacheProjet.update({ where: { id: t.id }, data: { assigneId: cible } }),
          this.prisma.evenementTacheProjet.create({
            data: {
              tacheId: t.id,
              type: 'assignation',
              parId: acteurId,
              detail: `Confiée à ${noms.get(cible)} (départ)`,
            },
          }),
        );
        confiees.push({
          tacheId: t.id,
          projetId: t.projetId,
          societeId: t.societeId,
          titre: `${t.projet} · ${t.carte} · ${t.libelle}`,
          cible,
        });
      }
    }

    if (utilisateurId) {
      const compte = await this.prisma.utilisateur.findUniqueOrThrow({
        where: { id: utilisateurId },
        select: { actif: true },
      });
      if (archive && compte.actif) {
        ops.push(
          this.prisma.utilisateur.update({
            where: { id: utilisateurId },
            data: {
              actif: false,
              desactiveLe: maintenant,
              desactiveParId: acteurId,
              sessionsValidesDepuis: maintenant,
            },
          }),
          this.prisma.evenementCompte.create({
            data: { utilisateurId, type: 'compte_desactive', parId: acteurId, detail: MOTIF_ARCHIVAGE },
          }),
        );
      }
      if (!archive && !compte.actif) {
        const dernier = await this.prisma.evenementCompte.findFirst({
          where: { utilisateurId },
          orderBy: { createdAt: 'desc' },
          select: { type: true, detail: true },
        });
        if (dernier?.type === 'compte_desactive' && dernier.detail === MOTIF_ARCHIVAGE) {
          ops.push(
            this.prisma.utilisateur.update({
              where: { id: utilisateurId },
              data: { actif: true, desactiveLe: null, desactiveParId: null },
            }),
            this.prisma.evenementCompte.create({
              data: { utilisateurId, type: 'compte_reactive', parId: acteurId, detail: 'Dossier RH désarchivé' },
            }),
          );
        }
      }
    }

    const [d] = await this.prisma.$transaction([
      this.prisma.dossierPersonnel.update({
        where: { id },
        data: archive ? { archiveLe: maintenant, archiveParId: acteurId } : { archiveLe: null, archiveParId: null },
        include: INCLURE,
      }),
      ...ops,
    ]);
    for (const c of confiees) {
      await this.notifications.envoyer({
        societeId: c.societeId,
        type: 'tache_assignee',
        titre: `Tâche reprise après un départ · ${c.titre}`,
        destinataireIds: await this.notifications.comptesDe([c.cible]),
        parId: acteurId,
        projetId: c.projetId,
      });
    }
    return versDossier(d as DossierLu);
  }

  // Tâches de projet encore ouvertes au nom du salarié (rien à rendre une fois
  // validée ou non nécessaire), et les collègues de sa société, encore en
  // poste, à qui les confier.
  async tachesOuvertes(id: string) {
    const d = await this.prisma.dossierPersonnel.findUnique({
      where: { id },
      select: { collaborateur: { select: { id: true, societeId: true } } },
    });
    if (!d) throw new NotFoundException('Dossier introuvable');
    const collab = d.collaborateur;
    if (!collab) return { taches: [], candidats: [] };
    const [taches, collegues] = await Promise.all([
      this.prisma.tacheProjet.findMany({
        where: { assigneId: collab.id, statut: { in: ['a_faire', 'a_valider', 'reprise'] } },
        select: {
          id: true,
          libelle: true,
          statut: true,
          finLe: true,
          carte: { select: { libelle: true } },
          projet: { select: { id: true, code: true, societeId: true } },
        },
        orderBy: [{ finLe: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.collaborateur.findMany({
        where: {
          societeId: collab.societeId,
          id: { not: collab.id },
          OR: [{ dossierPersonnel: null }, { dossierPersonnel: { archiveLe: null } }],
        },
        select: { id: true, prenom: true, nom: true },
        orderBy: [{ prenom: 'asc' }, { nom: 'asc' }],
      }),
    ]);
    return {
      taches: taches.map((t) => ({
        id: t.id,
        libelle: t.libelle,
        statut: t.statut,
        finLe: t.finLe,
        carte: t.carte.libelle,
        projet: t.projet.code,
        projetId: t.projet.id,
        societeId: t.projet.societeId,
      })),
      candidats: collegues.map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}` })),
    };
  }

  async joindrePiece(id: string, type: TypePieceDossier, dto: PieceDto, acteurId: string) {
    await this.charger(id);
    if (!dto.url.startsWith('data:')) throw new BadRequestException('Fichier invalide.');
    await this.prisma.pieceDossierPersonnel.upsert({
      where: { dossierId_type: { dossierId: id, type } },
      create: { dossierId: id, type, nom: dto.nom, cle: dto.url, ajouteParId: acteurId },
      update: { nom: dto.nom, cle: dto.url, ajouteParId: acteurId, createdAt: new Date() },
    });
    return this.detail(id);
  }

  // --- Bulletins de paie (lot 5b) : un par mois, remplaçable ------------------
  async deposerBulletin(id: string, mois: string, dto: PieceDto, acteurId: string) {
    const d = await this.charger(id);
    verifierMoisBulletin(mois, d.dateEntree);
    if (!dto.url.startsWith('data:')) throw new BadRequestException('Fichier invalide.');
    const data = { nom: dto.nom, cle: dto.url, deposeParId: acteurId };
    await this.prisma.bulletinPaie.upsert({
      where: { dossierId_mois: { dossierId: id, mois } },
      create: { dossierId: id, mois, ...data },
      update: data,
    });
    await this.tracer(id, 'bulletin_depose', acteurId, mois);
    await this.notifications.envoyer({
      societeId: d.societeId,
      type: 'bulletin_depose',
      titre: `Bulletin de paie disponible · ${mois.split('-').reverse().join('/')}`,
      destinataireIds: [await this.notifications.compteDuDossier(id)],
      parId: acteurId,
    });
    return this.detail(id);
  }

  async bulletin(id: string, mois: string, acteurId: string) {
    const b = await this.prisma.bulletinPaie.findUnique({
      where: { dossierId_mois: { dossierId: id, mois } },
      select: { nom: true, cle: true },
    });
    if (!b) throw new NotFoundException('Bulletin absent');
    await this.tracer(id, 'bulletin_consulte', acteurId, mois);
    return { nom: b.nom, url: b.cle };
  }

  // Retrait d'un dépôt erroné (mauvais salarié, mauvais mois).
  async retirerBulletin(id: string, mois: string, acteurId: string) {
    await this.charger(id);
    const { count } = await this.prisma.bulletinPaie.deleteMany({ where: { dossierId: id, mois } });
    if (count === 0) throw new NotFoundException('Bulletin absent');
    await this.tracer(id, 'bulletin_retire', acteurId, mois);
    return this.detail(id);
  }

  // --- internes ---------------------------------------------------------------
  private async charger(id: string): Promise<DossierLu> {
    const d = await this.prisma.dossierPersonnel.findUnique({ where: { id }, include: INCLURE });
    if (!d) throw new NotFoundException('Dossier introuvable');
    return d;
  }

  private async prochainMatricule(): Promise<string> {
    const dernier = await this.prisma.dossierPersonnel.findFirst({
      orderBy: { matricule: 'desc' },
      select: { matricule: true },
    });
    const n = dernier ? Number(dernier.matricule.replace(/\D/g, '')) + 1 : 1;
    return `GH-${String(n).padStart(4, '0')}`;
  }

  // Société active ; fiche d'équipe liée de la même société et pas déjà liée ;
  // compte direct seulement sans fiche d'équipe (la fiche porte déjà le compte).
  private async valider(dto: DossierPersonnelDto, id: string | null) {
    const { societeId, collaborateurId, utilisateurId, ...reste } = dto;
    const data: Prisma.DossierPersonnelUncheckedUpdateInput = { ...reste };
    if (societeId) {
      const s = await this.prisma.societe.findFirst({ where: { id: societeId, actif: true, accesOuvert: true } });
      if (!s) throw new BadRequestException('Société inconnue, inactive ou pas encore ouverte.');
      data.societeId = societeId;
    }
    if (collaborateurId !== undefined) {
      if (collaborateurId !== null) {
        const c = await this.prisma.collaborateur.findUnique({
          where: { id: collaborateurId },
          select: { societeId: true, dossierPersonnel: { select: { id: true } } },
        });
        const societeCible = societeId ?? (id ? (await this.charger(id)).societeId : null);
        if (!c || c.societeId !== societeCible) {
          throw new BadRequestException("Fiche d'équipe introuvable dans cette société.");
        }
        if (c.dossierPersonnel && c.dossierPersonnel.id !== id) {
          throw new ConflictException("Cette fiche d'équipe a déjà un dossier.");
        }
      }
      data.collaborateurId = collaborateurId;
      // Relier une fiche d'équipe remplace le compte direct : c'est la fiche
      // qui porte désormais le compte.
      if (collaborateurId !== null) data.utilisateurId = null;
    }
    if (utilisateurId !== undefined && utilisateurId !== null) {
      const ficheCible =
        collaborateurId !== undefined ? collaborateurId : id ? (await this.charger(id)).collaborateurId : null;
      if (ficheCible) {
        throw new BadRequestException("Ce dossier est relié à une fiche d'équipe : le compte vient de la fiche.");
      }
      const u = await this.prisma.utilisateur.findUnique({
        where: { id: utilisateurId },
        select: { _count: { select: { collaborations: true } }, dossierPersonnel: { select: { id: true } } },
      });
      if (!u) throw new BadRequestException('Compte introuvable.');
      if (u._count.collaborations > 0) {
        throw new ConflictException("Ce compte a une fiche d'équipe : reliez le dossier à la fiche.");
      }
      if (u.dossierPersonnel && u.dossierPersonnel.id !== id) {
        throw new ConflictException('Ce compte est déjà relié à un autre dossier.');
      }
      data.utilisateurId = utilisateurId;
    } else if (utilisateurId === null) {
      data.utilisateurId = null;
    }
    return data as Prisma.DossierPersonnelUncheckedCreateInput & Prisma.DossierPersonnelUncheckedUpdateInput;
  }
}

// Mois AAAA-MM déjà commencé, et pas avant l'entrée du salarié.
export function verifierMoisBulletin(mois: string, dateEntree: string | null, aujourdhui = todayIso()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new BadRequestException('Mois invalide (AAAA-MM).');
  if (mois > aujourdhui.slice(0, 7)) throw new BadRequestException('Pas de bulletin pour un mois à venir.');
  if (dateEntree && mois < dateEntree.slice(0, 7))
    throw new BadRequestException("Mois antérieur à l'entrée du salarié.");
}
