import { quitterCellule } from './cellules.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ComptesService } from '../auth/comptes.service';
import { CompteMini, versCollaborateur } from '../commun/format-contrat';
import { avancementChecklistFichiers, statsTaches } from '../projets/domaine/gardes';
import {
  GROUPES_CHECKLIST_AVP,
  GROUPES_CHECKLIST_EXECUTION,
  GROUPES_CHECKLIST_PERMIS,
} from '../projets/domaine/config';
import { ouProjetsDuCollaborateur } from '../projets/projet-acces';
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

  // `cellule` : un id (une équipe), plusieurs (tableau — ex. équipes d'un
  // projet multi-cellules depuis sept. 2026), ou le sentinel 'sans' (orphelins).
  async findAll(societeId: string, q?: string, cellule?: string | string[]) {
    const where: Prisma.CollaborateurWhereInput = { societeId };
    if (cellule === 'sans') where.celluleId = null;
    else if (Array.isArray(cellule)) {
      if (cellule.length) where.celluleId = { in: cellule };
    } else if (cellule) where.celluleId = cellule;

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
  // `estDispatcher` + `equipeAssignable` : ajoutés pour que le collab puisse
  // réassigner une tâche depuis sa propre interface (point 1, sept. 2026) —
  // exactement le périmètre du guard estAutoriseAAssigner (sa cellule
  // uniquement), pas une liste d'équipe générale (cf. « Mon équipe », pas
  // construite tant qu'aucun besoin réel ne l'exige).
  async monProfil(societeId: string, utilisateurId: string) {
    const c = await this.prisma.collaborateur.findFirst({
      where: { societeId, utilisateurId },
      include: {
        ...AVEC_COMPTE,
        cellule: {
          select: {
            nom: true,
            dispatcherId: true,
            membres: { select: { id: true, prenom: true, nom: true } },
          },
        },
      },
    });
    if (!c) {
      throw new NotFoundException('Aucune fiche collaborateur pour ce compte');
    }
    const estDispatcher = !!c.cellule && c.cellule.dispatcherId === c.id;
    return {
      ...versCollaborateur({ ...c, compte: compteMini(c) }),
      celluleNom: c.cellule?.nom ?? null,
      estDispatcher,
      equipeAssignable: estDispatcher ? (c.cellule?.membres ?? []) : [],
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

    // Changement de cellule : le poste occupé dans l'ancienne se libère et
    // un dispatcher n'en est plus le dispatcher — sans ce nettoyage,
    // Cellule.dispatcherId pointerait vers quelqu'un qui n'en est plus membre.
    if (dto.celluleId !== undefined && dto.celluleId !== actuel.celluleId && actuel.celluleId) {
      await this.prisma.$transaction((tx) => quitterCellule(tx, id, actuel.celluleId));
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
  // page « Mes indicateurs » (rings + listes projets). Tout est dérivé des
  // mêmes projets déjà chargés — un seul appel. Le « fait brut annuel » /
  // « délai avant-projet tenu » (ancré sur valideLe) a été retiré avec le
  // verrou de validation avant-projet (sept. 2026, décision boss) — aucun
  // signal de remplacement fourni, pas de proxy inventé (cf. mémoire
  // « ne jamais inventer de données métier »).
  async indicateurs(societeId: string, id: string) {
    const collab = await this.charger(societeId, id);

    const projets = await this.prisma.projet.findMany({
      where: { societeId, OR: ouProjetsDuCollaborateur({ id, celluleId: collab.celluleId }) },
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
            lignesChecklist: {
              where: { supprimee: false },
              select: {
                nonRequise: true,
                images: { where: { supprimee: false }, select: { id: true } },
                fichiers: { where: { supprimee: false }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    // % de checklist d'un projet — null s'il n'a pas encore de lignes. Statut
    // dérivé des fichiers joints (même modèle que Foncier/Unbord depuis la
    // restructuration Avant-projet, sept. 2026).
    const pctProjet = (ls: { statut: 'fait' | 'en_attente' }[]) =>
      ls.length ? avancementChecklistFichiers(ls).pct : null;

    type LigneProjet = (typeof projets)[number];
    const vers = (p: LigneProjet) => {
      const items = (p.avantProjet?.lignesChecklist ?? []).map((l) => ({
        statut: (l.nonRequise || l.images.length > 0 || l.fichiers.length > 0
          ? 'fait'
          : 'en_attente') as 'fait' | 'en_attente',
      }));
      return {
        id: p.id,
        code: p.code,
        programme: p.programme,
        type: p.type,
        phase: p.phase,
        clientNom: p.client.nom,
        checklistPct: pctProjet(items),
      };
    };

    const actifs = projets.filter((p) => p.phase !== 'livre');
    const livres = projets.filter((p) => p.phase === 'livre');

    const { stats, taches } = await this.mesTaches(id);

    return {
      projetsEnCours: actifs.length,
      projetsLivres: livres.length,
      mesTaches: stats,
      // Liste détaillée (point 2, sept. 2026, décision boss) — mêmes tâches
      // que `mesTaches` ci-dessus, mais individuelles et filtrables (statut/
      // module/échéance) plutôt que juste un agrégat. Sert aussi de socle
      // pour une future vue « tâches de mon équipe » côté dispatcher.
      taches,
      projetsActifs: actifs.map(vers),
      historique: livres.map(vers),
    };
  }

  // « Mes tâches » (point 3, sept. 2026, décision boss) : lignes Avant-projet
  // assignées + items des blocs Permis/Exécution dont ce collaborateur est
  // responsable. `stats` crédite chaque item individuellement (même grain
  // partout, cf. statsTaches) ; `taches` reste lisible : une ligne par tâche
  // Avant-projet, une ligne par BLOC pour Permis/Exécution (le bloc est
  // l'unité de travail qu'on regarde, même si le score, lui, compte ses
  // items un par un — deux vues de la même donnée, pas une contradiction).
  // Trois requêtes ciblées plutôt qu'un unique gros `include` sur `projets` :
  // ces tâches ne sont pas bornées aux projets « suivis »
  // (ouProjetsDuCollaborateur) — un dispatcher ou un ancien responsable garde
  // ses tâches passées même si sa cellule a changé depuis.
  private async mesTaches(collaborateurId: string) {
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const enRetard = (fait: boolean, echeance: string | null) =>
      !fait && echeance != null && echeance < aujourdHui;

    // Avant-projet : assignation PAR BLOC depuis sept. 2026 (même motif que
    // Permis/Exécution ci-dessous, plus la ligne assignée d'avant) — statut
    // dérivé des fichiers joints, pas de `fait` déclaratif ni de `faitLe`
    // (aucun événement de complétion horodaté à tracer, cf. schema.prisma).
    const blocsAvp = await this.prisma.blocChecklistAvp.findMany({
      where: { responsableId: collaborateurId },
      select: {
        avantProjetId: true,
        groupe: true,
        echeance: true,
        avantProjet: { select: { projet: { select: { code: true, programme: true } } } },
      },
    });
    const lignesAvp = blocsAvp.length
      ? await this.prisma.ligneChecklistAvp.findMany({
          where: {
            supprimee: false,
            OR: blocsAvp.map((b) => ({ avantProjetId: b.avantProjetId, groupe: b.groupe })),
          },
          select: {
            avantProjetId: true,
            groupe: true,
            nonRequise: true,
            images: { where: { supprimee: false }, select: { id: true } },
            fichiers: { where: { supprimee: false }, select: { id: true } },
          },
        })
      : [];
    const cleBlocAvp = (avantProjetId: string, groupe: string) => `${avantProjetId}:${groupe}`;
    const echeanceAvp = new Map(
      blocsAvp.map((b) => [cleBlocAvp(b.avantProjetId, b.groupe), b.echeance]),
    );
    const resoluAvp = (l: { nonRequise: boolean; images: unknown[]; fichiers: unknown[] }) =>
      l.nonRequise || l.images.length > 0 || l.fichiers.length > 0;

    const blocsPermis = await this.prisma.blocPermis.findMany({
      where: { responsableId: collaborateurId },
      select: {
        permisId: true,
        groupe: true,
        echeance: true,
        permis: { select: { projet: { select: { code: true, programme: true } } } },
      },
    });
    const lignesPermis = blocsPermis.length
      ? await this.prisma.ligneChecklistPermis.findMany({
          where: {
            supprimee: false,
            OR: blocsPermis.map((b) => ({ permisId: b.permisId, groupe: b.groupe })),
          },
          select: { permisId: true, groupe: true, fait: true, faitLe: true },
        })
      : [];
    const cleBlocPermis = (permisId: string, groupe: string) => `${permisId}:${groupe}`;
    const echeancePermis = new Map(
      blocsPermis.map((b) => [cleBlocPermis(b.permisId, b.groupe), b.echeance]),
    );

    const blocsExecution = await this.prisma.blocExecution.findMany({
      where: { responsableId: collaborateurId },
      select: {
        projetId: true,
        groupe: true,
        echeance: true,
        projet: { select: { code: true, programme: true } },
      },
    });
    const lignesExecution = blocsExecution.length
      ? await this.prisma.ligneChecklistExecution.findMany({
          where: {
            supprimee: false,
            OR: blocsExecution.map((b) => ({ projetId: b.projetId, groupe: b.groupe })),
          },
          select: { projetId: true, groupe: true, fait: true, faitLe: true },
        })
      : [];
    const cleBlocExecution = (projetId: string, groupe: string) => `${projetId}:${groupe}`;
    const echeanceExecution = new Map(
      blocsExecution.map((b) => [cleBlocExecution(b.projetId, b.groupe), b.echeance]),
    );

    const stats = statsTaches([
      ...lignesAvp.map((l) => ({
        fait: resoluAvp(l),
        // Pas de faitLe (statut dérivé, aucun événement horodaté) — ne
        // compte jamais dans respectDelais, comme une tâche non terminée
        // sans échéance dépassée le ferait déjà.
        faitLe: null,
        echeance: echeanceAvp.get(cleBlocAvp(l.avantProjetId, l.groupe)) ?? null,
      })),
      ...lignesPermis.map((l) => ({
        fait: l.fait,
        faitLe: l.faitLe,
        echeance: echeancePermis.get(cleBlocPermis(l.permisId, l.groupe)) ?? null,
      })),
      ...lignesExecution.map((l) => ({
        fait: l.fait,
        faitLe: l.faitLe,
        echeance: echeanceExecution.get(cleBlocExecution(l.projetId, l.groupe)) ?? null,
      })),
    ]);

    const libellePermis = new Map(GROUPES_CHECKLIST_PERMIS.map((g) => [g.groupe, g.libelle]));
    const libelleExecution = new Map(
      GROUPES_CHECKLIST_EXECUTION.map((g) => [g.groupe, g.libelle]),
    );

    const libelleAvp = new Map(GROUPES_CHECKLIST_AVP.map((g) => [g.groupe, g.libelle]));
    const tachesAvp = blocsAvp.map((b) => {
      const items = lignesAvp.filter(
        (l) => l.avantProjetId === b.avantProjetId && l.groupe === b.groupe,
      );
      const faits = items.filter(resoluAvp).length;
      return {
        id: cleBlocAvp(b.avantProjetId, b.groupe),
        module: 'avant_projet' as const,
        libelle: libelleAvp.get(b.groupe) ?? b.groupe,
        projetId: b.avantProjetId,
        projetCode: b.avantProjet.projet.code,
        projetProgramme: b.avantProjet.projet.programme,
        fait: items.length > 0 && faits === items.length,
        faits,
        total: items.length,
        echeance: b.echeance,
        enRetard: enRetard(faits === items.length && items.length > 0, b.echeance),
      };
    });

    const tachesPermis = blocsPermis.map((b) => {
      const items = lignesPermis.filter(
        (l) => l.permisId === b.permisId && l.groupe === b.groupe,
      );
      const faits = items.filter((l) => l.fait).length;
      return {
        id: cleBlocPermis(b.permisId, b.groupe),
        module: 'permis' as const,
        libelle: libellePermis.get(b.groupe) ?? b.groupe,
        projetId: b.permisId,
        projetCode: b.permis.projet.code,
        projetProgramme: b.permis.projet.programme,
        fait: items.length > 0 && faits === items.length,
        faits,
        total: items.length,
        echeance: b.echeance,
        enRetard: enRetard(faits === items.length && items.length > 0, b.echeance),
      };
    });

    const tachesExecution = blocsExecution.map((b) => {
      const items = lignesExecution.filter(
        (l) => l.projetId === b.projetId && l.groupe === b.groupe,
      );
      const faits = items.filter((l) => l.fait).length;
      return {
        id: cleBlocExecution(b.projetId, b.groupe),
        module: 'execution' as const,
        libelle: libelleExecution.get(b.groupe) ?? b.groupe,
        projetId: b.projetId,
        projetCode: b.projet.code,
        projetProgramme: b.projet.programme,
        fait: items.length > 0 && faits === items.length,
        faits,
        total: items.length,
        echeance: b.echeance,
        enRetard: enRetard(faits === items.length && items.length > 0, b.echeance),
      };
    });

    return {
      stats,
      taches: [...tachesAvp, ...tachesPermis, ...tachesExecution],
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
