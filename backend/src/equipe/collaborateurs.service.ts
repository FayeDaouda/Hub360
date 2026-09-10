import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ComptesService } from '../auth/comptes.service';
import { CompteMini, versCollaborateur } from '../commun/format-contrat';
import { avancementChecklistAvp } from '../projets/domaine/gardes';
import { CreerCollaborateurDto, MajCollaborateurDto } from './dto';

// On ne remonte QUE ces champs du compte — jamais motDePasseHash.
const AVEC_COMPTE = {
  utilisateur: { select: { email: true, actif: true, motDePasseHash: true } },
} as const;

type AvecUtilisateur = {
  utilisateur: { email: string; actif: boolean; motDePasseHash: string | null } | null;
};

function compteMini(c: AvecUtilisateur): CompteMini {
  const u = c.utilisateur;
  return u ? { email: u.email, actif: u.actif, aMotDePasse: u.motDePasseHash != null } : null;
}

@Injectable()
export class CollaborateursService {
  constructor(
    private prisma: PrismaService,
    private comptes: ComptesService,
  ) {}

  async findAll(societeId: string, q?: string, cellule?: string) {
    const where: Prisma.CollaborateurWhereInput = { societeId };
    if (cellule === 'sans') where.celluleId = null;
    else if (cellule) where.celluleId = cellule;

    const liste = await this.prisma.collaborateur.findMany({
      where,
      include: AVEC_COMPTE,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const terme = q?.trim().toLowerCase();
    const filtres = terme
      ? liste.filter((c) =>
          `${c.prenom} ${c.nom} ${c.role}`.toLowerCase().includes(terme),
        )
      : liste;
    return filtres.map((c) => versCollaborateur({ ...c, compte: compteMini(c) }));
  }

  // Fiche du collaborateur connecté (résolue depuis le compte, pas depuis un
  // :id d'URL) — socle des vues /collab et des gardes d'accès des étapes 3/4.
  async monProfil(societeId: string, utilisateurId: string) {
    const c = await this.prisma.collaborateur.findFirst({
      where: { societeId, utilisateurId },
      include: { ...AVEC_COMPTE, cellule: { select: { nom: true } } },
    });
    if (!c) {
      throw new NotFoundException('Aucune fiche collaborateur pour ce compte');
    }
    return {
      ...versCollaborateur({ ...c, compte: compteMini(c) }),
      celluleNom: c.cellule?.nom ?? null,
    };
  }

  async creer(societeId: string, dto: CreerCollaborateurDto) {
    if (dto.celluleId) await this.verifierCellule(societeId, dto.celluleId);
    const c = await this.prisma.collaborateur.create({
      data: {
        societeId,
        prenom: dto.prenom,
        nom: dto.nom,
        role: dto.role,
        niveau: dto.niveau,
        celluleId: dto.celluleId ?? null,
        photoCle: dto.photo ?? null,
        dateArrivee: dto.dateArrivee ?? null,
      },
      include: AVEC_COMPTE,
    });
    return versCollaborateur({ ...c, compte: compteMini(c) });
  }

  async maj(
    societeId: string,
    id: string,
    dto: MajCollaborateurDto,
    adminId: string,
  ) {
    const actuel = await this.charger(societeId, id);
    if (dto.celluleId) await this.verifierCellule(societeId, dto.celluleId);

    const data: Prisma.CollaborateurUpdateInput = {};
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.niveau !== undefined) data.niveau = dto.niveau;
    if (dto.photo !== undefined) data.photoCle = dto.photo;
    if (dto.dateArrivee !== undefined) data.dateArrivee = dto.dateArrivee;
    if (dto.celluleId !== undefined) {
      data.cellule = dto.celluleId
        ? { connect: { id: dto.celluleId } }
        : { disconnect: true };
    }

    // Activer / désactiver le compte lié (kill switch = Utilisateur.actif).
    if (dto.actif !== undefined && actuel.utilisateurId) {
      await this.majActif(actuel.utilisateurId, dto.actif, adminId);
    }

    const c = await this.prisma.collaborateur.update({
      where: { id },
      data,
      include: AVEC_COMPTE,
    });
    return versCollaborateur({ ...c, compte: compteMini(c) });
  }

  // Invitation : délègue à ComptesService (crée/lie le compte, émet le jeton).
  inviter(societeId: string, id: string, email: string, adminId: string) {
    return this.comptes.inviter(societeId, id, email, adminId);
  }

  async supprimer(societeId: string, id: string) {
    await this.charger(societeId, id);
    // Suppression dure (v1) ; SetNull sur les avant-projets où il est
    // dessinateur / responsable 3D via les FK.
    await this.prisma.collaborateur.delete({ where: { id } });
  }

  // -- Indicateurs de performance : pur calcul de lecture, aucune table --------
  // Sert deux vues : le bandeau 4 chiffres (accueil collab + fiche admin) et la
  // page « Mes indicateurs » (rings + fait brut annuel + listes projets). Tout
  // est dérivé des mêmes projets déjà chargés — un seul appel.
  async indicateurs(societeId: string, id: string) {
    const collab = await this.charger(societeId, id);

    const ou: Prisma.ProjetWhereInput[] = [
      { avantProjet: { dessinateurId: id } },
      { avantProjet: { responsable3dId: id } },
    ];
    if (collab.celluleId) ou.push({ celluleId: collab.celluleId });

    const projets = await this.prisma.projet.findMany({
      where: { societeId, OR: ou },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        programme: true,
        type: true,
        phase: true,
        client: { select: { nom: true } },
        avantProjet: {
          select: {
            dessinateurId: true,
            responsable3dId: true,
            dateFin: true,
            valideLe: true,
            lignesChecklist: { select: { fait: true, nonRequis: true } },
          },
        },
      },
    });

    // % de checklist d'un projet — null s'il n'a pas encore de lignes.
    const pctProjet = (ls: { fait: boolean; nonRequis: boolean }[]) =>
      ls.length ? avancementChecklistAvp(ls).pct : null;

    type LigneProjet = (typeof projets)[number];
    const vers = (p: LigneProjet) => ({
      id: p.id,
      code: p.code,
      programme: p.programme,
      type: p.type,
      phase: p.phase,
      clientNom: p.client.nom,
      checklistPct: pctProjet(p.avantProjet?.lignesChecklist ?? []),
      apDateFin: p.avantProjet?.dateFin ?? null,
      apValideLe: p.avantProjet?.valideLe?.toISOString() ?? null,
    });

    const actifs = projets.filter((p) => p.phase !== 'livre');
    const livres = projets.filter((p) => p.phase === 'livre');

    // Délais avant-projet : uniquement là où CE collaborateur porte l'avant-projet
    // (dessinateur / resp. 3D), daté ET validé. Mesure « valideLe vs dateFin »,
    // rien d'autre — aucune date de livraison réelle n'est suivie.
    const surEcheance = projets.filter(
      (p) =>
        (p.avantProjet?.dessinateurId === id ||
          p.avantProjet?.responsable3dId === id) &&
        p.avantProjet?.dateFin &&
        p.avantProjet?.valideLe,
    );
    const tenu = (p: LigneProjet) =>
      new Date(p.avantProjet!.valideLe!) <=
      new Date(`${p.avantProjet!.dateFin}T23:59:59`);
    const aTemps = surEcheance.filter(tenu).length;

    // Fait brut annuel : la même mesure, bornée aux avant-projets validés dans
    // l'année civile en cours. Toujours renvoyé (0 / 0 si rien), aucune notion
    // de série ni de « d'affilée ».
    const annee = new Date().getFullYear();
    const anneeEnCours = surEcheance.filter(
      (p) => new Date(p.avantProjet!.valideLe!).getFullYear() === annee,
    );

    const pcts = projets
      .map((p) => p.avantProjet?.lignesChecklist ?? [])
      .filter((ls) => ls.length > 0)
      .map((ls) => avancementChecklistAvp(ls).pct);
    const checklistPct = pcts.length
      ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
      : null;

    return {
      projetsEnCours: actifs.length,
      projetsLivres: livres.length,
      avantProjetDelais: { aTemps, total: surEcheance.length },
      checklistPct,
      faitAnnuel: {
        annee,
        datesCetteAnnee: anneeEnCours.length,
        dansLesDelais: anneeEnCours.filter(tenu).length,
      },
      projetsActifs: actifs.map(vers),
      historique: livres.map(vers),
    };
  }

  // -- internes --------------------------------------------------------------
  private async majActif(utilisateurId: string, actif: boolean, adminId: string) {
    await this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: actif
        ? { actif: true, desactiveLe: null, desactiveParId: null }
        : {
            actif: false,
            desactiveLe: new Date(),
            desactiveParId: adminId,
            // coupe aussi toute session vivante (belt & suspenders avec !actif)
            sessionsValidesDepuis: new Date(),
          },
    });
    await this.prisma.evenementCompte.create({
      data: {
        utilisateurId,
        type: actif ? 'compte_reactive' : 'compte_desactive',
        parId: adminId,
      },
    });
  }

  private async charger(societeId: string, id: string) {
    const c = await this.prisma.collaborateur.findFirst({ where: { id, societeId } });
    if (!c) throw new NotFoundException('Collaborateur introuvable');
    return c;
  }

  private async verifierCellule(societeId: string, celluleId: string) {
    const c = await this.prisma.cellule.findFirst({ where: { id: celluleId, societeId } });
    if (!c) throw new NotFoundException('Cellule introuvable');
  }
}
