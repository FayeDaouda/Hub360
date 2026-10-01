import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Categorie, EtapePreBilan, GroupeChecklistAvp, Phase, Prisma, StatutProjet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ETAPES_PRE_BILAN,
  GABARIT_CHECKLIST_AVP,
  GROUPES_CHECKLIST_AVP,
  LIBELLES_PHASE,
} from './domaine/config';
import { NotificationsService } from '../notifications/notifications.service';
import { verifierFenetreBloc } from './domaine/fenetre-bloc';
import { phasesAdjacentes } from './domaine/gardes';
import { versAvantProjet, versProjetExecution, type FichierLigneChecklistAvp } from '../commun/format-contrat';
import { agitEnDirection, ouProjetsDuCollaborateur } from './projet-acces';
import {
  estAutoriseAAssigner,
  estDispatcherDuneCelluleDuProjet,
  verifierResponsableOuAdmin,
} from './dispatch-acces';
import {
  AjouterLigneChecklistAvpDto,
  DeciderProlongationBlocChecklistAvpDto,
  DemanderProlongationBlocChecklistAvpDto,
  JoindreFichiersLigneChecklistAvpDto,
  JoindreImagesLigneChecklistAvpDto,
  PatchAvantProjetDto,
  PatchBlocChecklistAvpDto,
  PatchLigneChecklistAvpDto,
  PatchVersionDto,
} from './dto';

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function libelleGroupeChecklistAvp(groupe: GroupeChecklistAvp): string {
  return GROUPES_CHECKLIST_AVP.find((g) => g.groupe === groupe)?.libelle ?? groupe;
}

// Contexte d'accès résolu par le contrôleur depuis req.user. `null` = admin
// (voit tout) ; sinon la liste est restreinte au périmètre du collaborateur.
type AccesListe = { role: string; userId: string; societeId: string };

@Injectable()
export class ProjetsService {
  private readonly log = new Logger('Projets');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAll(societeId: string, acces?: AccesListe) {
    const where: Prisma.ProjetWhereInput = { societeId };

    if (acces && acces.role === 'collaborateur') {
      const collab = await this.prisma.collaborateur.findFirst({
        where: { utilisateurId: acces.userId, societeId },
        select: { id: true, celluleId: true },
      });
      if (!collab) throw new NotFoundException('Aucune fiche collaborateur pour ce compte');
      where.OR = ouProjetsDuCollaborateur(collab);
    }

    const projets = await this.prisma.projet.findMany({
      where,
      include: { client: true, cellules: true },
      orderBy: { createdAt: 'desc' },
    });
    return projets.map(versProjetExecution);
  }

  async findOne(societeId: string, id: string) {
    const projet = await this.prisma.projet.findFirst({
      where: { id, societeId },
      include: { client: true, cellules: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable');
    return versProjetExecution(projet);
  }

  // Remplace l'ENSEMBLE des cellules du projet par `celluleIds` (liste vide =
  // désassigner complètement) — plusieurs équipes par projet depuis sept.
  // 2026 (décision boss), remplace l'ancien « 1 projet = 1 cellule ».
  async assignerCellules(
    societeId: string,
    id: string,
    celluleIds: string[],
    parId?: string,
  ) {
    const projet = await this.charger(societeId, id);
    const idsUniques = [...new Set(celluleIds)];
    if (idsUniques.length) {
      const count = await this.prisma.cellule.count({
        where: { id: { in: idsUniques }, societeId },
      });
      if (count !== idsUniques.length) throw new NotFoundException('Cellule introuvable');
    }
    let statut: StatutProjet = projet.statut;
    if (projet.statut === 'a_assigner' && idsUniques.length) statut = 'assigne';
    else if (!idsUniques.length && projet.statut === 'assigne') statut = 'a_assigner';

    const avantIds = new Set(projet.cellules.map((c) => c.celluleId));
    const maj = await this.prisma.$transaction(async (tx) => {
      await tx.projetCellule.deleteMany({ where: { projetId: id } });
      if (idsUniques.length) {
        await tx.projetCellule.createMany({
          data: idsUniques.map((celluleId) => ({ projetId: id, celluleId })),
        });
      }
      return tx.projet.update({
        where: { id },
        data: { statut },
        include: { client: true, cellules: true },
      });
    });

    // Notifie chaque cellule NOUVELLEMENT ajoutée (pas celles déjà en place,
    // pas au simple retrait d'assignation).
    const nouvelles = idsUniques.filter((cid) => !avantIds.has(cid));
    for (const celluleId of nouvelles) {
      await this.notifier(() =>
        this.notifications.pousser({
          societeId,
          projet: { id: maj.id, code: maj.code, celluleIds: [celluleId] },
          type: 'projet_assigne',
          titre: `${maj.programme} · assigné à ta cellule`,
          parId,
        }),
      );
    }
    return versProjetExecution(maj);
  }

  // PATCH /projets/:id/carte — pose ou retire le pin géo (posé à la main).
  async poserPin(
    societeId: string,
    id: string,
    coords: { latitude: number | null; longitude: number | null },
  ) {
    await this.charger(societeId, id);
    const maj = await this.prisma.projet.update({
      where: { id },
      data: { latitude: coords.latitude, longitude: coords.longitude },
      include: { client: true, cellules: true },
    });
    return versProjetExecution(maj);
  }

  // -- Avant-projet --------------------------------------------------------
  // Restructuré sept. 2026 : 2 groupes (Livrables, Fichiers produits),
  // assignation PAR BLOC comme Permis/Exécution (cf. BlocChecklistAvp), items
  // à statut dérivé des fichiers joints comme Foncier/Unbord (plus de case
  // « fait »/note manuelles). Ajout/suppression d'item : admin OU dispatcher
  // d'une cellule du projet (nouveauté, cf. estDispatcherDuneCelluleDuProjet).

  async getAvantProjet(societeId: string, id: string) {
    await this.charger(societeId, id);
    const ap = await this.coquilleAvantProjet(id);
    return versAvantProjet(ap, await this.fichiersParLigneChecklistAvp(id));
  }

  async patchAvantProjet(societeId: string, id: string, dto: PatchAvantProjetDto) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    await this.prisma.avantProjet.update({ where: { projetId: id }, data: dto });
    return this.getAvantProjet(societeId, id);
  }

  // PATCH …/checklist/:ligneId — bascule « non nécessaire ». Accès par bloc :
  // bloc libre = toute l'équipe agit (règle de septembre, préservée en
  // repli) ; bloc assigné = seul le responsable (+ admin) — cf.
  // verifierAccesBlocChecklistAvp.
  async patchLigneChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    dto: PatchLigneChecklistAvpDto,
    utilisateurId: string,
    role: string,
  ) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const ligne = await this.trouverLigneChecklistAvp(id, ligneId);
    await this.verifierAccesBlocChecklistAvp(societeId, id, ligne.groupe, utilisateurId, role);

    const data: Prisma.LigneChecklistAvpUpdateInput = {};
    if (dto.fait !== undefined) data.fait = dto.fait;
    if (dto.nonRequise !== undefined) {
      data.nonRequise = dto.nonRequise;
      // Mutuellement exclusif avec « fait » — même règle que Permis.
      if (dto.nonRequise) data.fait = false;
    }

    await this.prisma.ligneChecklistAvp.update({ where: { id: ligneId }, data });
    return this.getAvantProjet(societeId, id);
  }

  async joindreImagesChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    dto: JoindreImagesLigneChecklistAvpDto,
    utilisateurId: string,
    role: string,
  ) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const ligne = await this.trouverLigneChecklistAvp(id, ligneId);
    await this.verifierAccesBlocChecklistAvp(societeId, id, ligne.groupe, utilisateurId, role);

    await this.prisma.$transaction([
      this.prisma.imageProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId: id,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          // Rendus 3D, esquisses, mood board — pas des photos du bâtiment,
          // même motif que Permis (cf. schema.prisma::TypePhotoImage).
          typePhoto: 'autre' as const,
          ligneChecklistAvpId: ligne.id,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFaitChecklistAvp(ligne.id),
    ]);
    return this.getAvantProjet(societeId, id);
  }

  async joindreFichiersChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    dto: JoindreFichiersLigneChecklistAvpDto,
    utilisateurId: string,
    role: string,
  ) {
    await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const ligne = await this.trouverLigneChecklistAvp(id, ligneId);
    await this.verifierAccesBlocChecklistAvp(societeId, id, ligne.groupe, utilisateurId, role);

    await this.prisma.$transaction([
      this.prisma.fichierProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId: id,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          taille: f.taille ?? 0,
          ligneChecklistAvpId: ligne.id,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFaitChecklistAvp(ligne.id),
    ]);
    return this.getAvantProjet(societeId, id);
  }

  // PATCH …/checklist/blocs/:groupe — admin OU dispatcher de la cellule du
  // responsable ciblé OU auto-désignation sur un bloc libre (même règle
  // exacte que Permis/Exécution, cf. estAutoriseAAssigner).
  async patchBlocChecklistAvp(
    societeId: string,
    id: string,
    groupe: GroupeChecklistAvp,
    dto: PatchBlocChecklistAvpDto,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    const avant = await this.prisma.blocChecklistAvp.findUnique({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
    });
    if (!avant) throw new NotFoundException('Bloc introuvable');

    if (!agitEnDirection(role)) {
      const cibleId = dto.responsableId !== undefined ? dto.responsableId : avant.responsableId;
      const autorise = await estAutoriseAAssigner(
        this.prisma,
        societeId,
        utilisateurId,
        cibleId ?? null,
        avant.responsableId,
      );
      if (!autorise) {
        throw new ForbiddenException(
          'Tu ne peux te désigner que sur un bloc libre, ou assigner les membres de ta cellule.',
        );
      }
    }

    verifierFenetreBloc(
      dto.debut !== undefined ? dto.debut : avant.debut,
      dto.echeance !== undefined ? dto.echeance : avant.echeance,
    );
    const data: Prisma.BlocChecklistAvpUpdateInput = {};
    if (dto.debut !== undefined) data.debut = dto.debut;
    if (dto.echeance !== undefined) data.echeance = dto.echeance;
    if (dto.responsableId !== undefined) {
      data.responsable = dto.responsableId
        ? { connect: { id: dto.responsableId } }
        : { disconnect: true };
    }

    await this.prisma.blocChecklistAvp.update({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
      data,
    });

    // Nouveau responsable (ou bloc libéré) : la remise/validation de l'ancien
    // ne le suit pas — le circuit repart de zéro (RH lot 5c).
    if (dto.responsableId !== undefined && dto.responsableId !== avant.responsableId) {
      await this.prisma.validationTache.deleteMany({ where: { section: 'avant_projet', projetId: id, groupe } });
    }

    const nouveauResponsable =
      dto.responsableId != null && dto.responsableId !== avant.responsableId;
    if (nouveauResponsable) {
      const collab = await this.prisma.collaborateur.findUnique({
        where: { id: dto.responsableId as string },
        select: { utilisateurId: true },
      });
      const destinataireId = collab?.utilisateurId;
      if (destinataireId) {
        await this.notifier(() =>
          this.notifications.pousser({
            societeId,
            projet: { id: projet.id, code: projet.code, celluleIds: projet.cellules.map((c) => c.celluleId) },
            type: 'checklist_assignee',
            titre: `${libelleGroupeChecklistAvp(groupe)} · responsable désigné sur ${projet.programme}`,
            parId: utilisateurId,
            destinataireIds: [destinataireId],
          }),
        );
      }
    }

    return this.getAvantProjet(societeId, id);
  }

  // POST …/checklist/blocs/:groupe/prolongation — le responsable DE CE BLOC
  // uniquement.
  async demanderProlongationBlocChecklistAvp(
    societeId: string,
    id: string,
    groupe: GroupeChecklistAvp,
    dto: DemanderProlongationBlocChecklistAvpDto,
    utilisateurId: string,
  ) {
    const projet = await this.charger(societeId, id);
    const collab = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId, societeId },
      select: { id: true },
    });
    if (!collab) throw new ForbiddenException('Aucune fiche collaborateur pour ce compte');

    const bloc = await this.prisma.blocChecklistAvp.findUnique({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
    });
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    if (bloc.responsableId !== collab.id) {
      throw new ForbiddenException("Ce bloc ne t'est pas assigné.");
    }

    await this.prisma.blocChecklistAvp.update({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
      data: {
        prolongationDemandeeLe: new Date(),
        prolongationEcheance: dto.echeance,
        prolongationMotif: dto.motif ?? null,
      },
    });

    const adminIds = await this.notifications.adminsDeSociete(societeId, utilisateurId);
    if (adminIds.length > 0) {
      await this.notifier(() =>
        this.notifications.pousser({
          societeId,
          projet: { id: projet.id, code: projet.code, celluleIds: projet.cellules.map((c) => c.celluleId) },
          type: 'prolongation_demandee',
          titre: `${libelleGroupeChecklistAvp(groupe)} · prolongation demandée sur ${projet.programme}`,
          parId: utilisateurId,
          destinataireIds: adminIds,
        }),
      );
    }

    return this.getAvantProjet(societeId, id);
  }

  // PATCH …/checklist/blocs/:groupe/prolongation — admin uniquement. Accepter
  // reporte `echeance` à la date proposée ; refuser la laisse telle quelle.
  // Dans les deux cas la demande est effacée (communiquée par notification).
  async deciderProlongationBlocChecklistAvp(
    societeId: string,
    id: string,
    groupe: GroupeChecklistAvp,
    dto: DeciderProlongationBlocChecklistAvpDto,
    utilisateurId: string,
  ) {
    const projet = await this.charger(societeId, id);
    const bloc = await this.prisma.blocChecklistAvp.findUnique({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
    });
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    if (!bloc.prolongationDemandeeLe) {
      throw new ConflictException('Aucune demande de prolongation en attente sur ce bloc');
    }

    const data: Prisma.BlocChecklistAvpUpdateInput = {
      prolongationDemandeeLe: null,
      prolongationEcheance: null,
      prolongationMotif: null,
    };
    if (dto.accepter) data.echeance = bloc.prolongationEcheance;

    await this.prisma.blocChecklistAvp.update({
      where: { avantProjetId_groupe: { avantProjetId: id, groupe } },
      data,
    });

    if (bloc.responsableId) {
      const collab = await this.prisma.collaborateur.findUnique({
        where: { id: bloc.responsableId },
        select: { utilisateurId: true },
      });
      const destinataireId = collab?.utilisateurId;
      if (destinataireId) {
        await this.notifier(() =>
          this.notifications.pousser({
            societeId,
            projet: { id: projet.id, code: projet.code, celluleIds: projet.cellules.map((c) => c.celluleId) },
            type: 'prolongation_decidee',
            titre: `${libelleGroupeChecklistAvp(groupe)} · prolongation ${dto.accepter ? 'acceptée' : 'refusée'} sur ${projet.programme}`,
            parId: utilisateurId,
            destinataireIds: [destinataireId],
          }),
        );
      }
    }

    return this.getAvantProjet(societeId, id);
  }

  // Ajout d'un item — admin OU dispatcher d'une cellule du projet (nouveauté
  // sept. 2026, cf. estDispatcherDuneCelluleDuProjet). Va en fin du groupe
  // ciblé.
  async ajouterLigneChecklistAvp(
    societeId: string,
    id: string,
    dto: AjouterLigneChecklistAvpDto,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await this.charger(societeId, id);
    await this.coquilleAvantProjet(id);
    if (!agitEnDirection(role)) {
      const autorise = await estDispatcherDuneCelluleDuProjet(
        this.prisma,
        societeId,
        utilisateurId,
        projet.cellules.map((c) => c.celluleId),
      );
      if (!autorise) {
        throw new ForbiddenException(
          "Réservé à l'administration ou au chef de team d'une des cellules du projet.",
        );
      }
    }

    const { _max } = await this.prisma.ligneChecklistAvp.aggregate({
      where: { avantProjetId: id, groupe: dto.groupe },
      _max: { ordre: true },
    });
    await this.prisma.ligneChecklistAvp.create({
      data: {
        avantProjetId: id,
        groupe: dto.groupe,
        libelle: dto.libelle,
        ordre: (_max.ordre ?? -1) + 1,
      },
    });
    return this.getAvantProjet(societeId, id);
  }

  // Suppression douce (comme ImageProjet/FichierProjet) — même autorisation
  // que l'ajout.
  async supprimerLigneChecklistAvp(
    societeId: string,
    id: string,
    ligneId: string,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await this.charger(societeId, id);
    if (!agitEnDirection(role)) {
      const autorise = await estDispatcherDuneCelluleDuProjet(
        this.prisma,
        societeId,
        utilisateurId,
        projet.cellules.map((c) => c.celluleId),
      );
      if (!autorise) {
        throw new ForbiddenException(
          "Réservé à l'administration ou au chef de team d'une des cellules du projet.",
        );
      }
    }

    const { count } = await this.prisma.ligneChecklistAvp.updateMany({
      where: { id: ligneId, avantProjetId: id, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId: utilisateurId },
    });
    if (count === 0) throw new NotFoundException('Item de checklist introuvable');
    return this.getAvantProjet(societeId, id);
  }

  // -- Pré-bilan ---------------------------------------------------------

  async getPreBilan(societeId: string, id: string) {
    const projet = await this.charger(societeId, id);
    return {
      projetId: id,
      versions: await this.versionsOrdonnees(id, projet.categorie),
    };
  }

  async ajouterVersion(societeId: string, id: string) {
    const projet = await this.charger(societeId, id);
    const sequence = ETAPES_PRE_BILAN[projet.categorie];
    const versions = await this.versionsOrdonnees(id, projet.categorie);
    const suivante = sequence[versions.length];
    if (!suivante) {
      throw new ConflictException('Toutes les versions du pré-bilan existent déjà');
    }
    const precedente = versions[versions.length - 1];

    await this.prisma.$transaction(async (tx) => {
      if (precedente && !precedente.figeeLe) {
        await tx.versionPreBilan.update({
          where: { projetId_etape: { projetId: id, etape: precedente.etape } },
          data: { figeeLe: new Date() },
        });
      }
      await tx.versionPreBilan.create({
        data: {
          projetId: id,
          etape: suivante,
          couts: precedente?.couts ?? {},
          prixVenteEstime: precedente?.prixVenteEstime ?? null,
        },
      });
    });

    return this.getPreBilan(societeId, id);
  }

  async patchVersion(
    societeId: string,
    id: string,
    etape: string,
    dto: PatchVersionDto,
  ) {
    await this.charger(societeId, id);
    const version = await this.prisma.versionPreBilan.findUnique({
      where: { projetId_etape: { projetId: id, etape: etape as EtapePreBilan } },
    });
    if (!version) throw new NotFoundException('Version introuvable');
    if (version.figeeLe) throw new ConflictException('Version figée');

    await this.prisma.versionPreBilan.update({
      where: { projetId_etape: { projetId: id, etape: etape as EtapePreBilan } },
      data: { couts: dto.couts, prixVenteEstime: dto.prixVenteEstime ?? null },
    });
    return this.getPreBilan(societeId, id);
  }

  // -- Phase -----------------------------------------------------------

  async changerPhase(
    societeId: string,
    id: string,
    cible: Phase,
    parId?: string,
  ) {
    const projet = await this.charger(societeId, id);
    if (!phasesAdjacentes(projet.categorie, projet.phase, cible)) {
      throw new UnprocessableEntityException('Transition de phase non adjacente');
    }

    const maj = await this.prisma.projet.update({
      where: { id },
      data: { phase: cible },
      include: { client: true, cellules: true },
    });

    await this.notifier(() =>
      this.notifications.pousser({
        societeId,
        projet: { id: maj.id, code: maj.code, celluleIds: projet.cellules.map((c) => c.celluleId) },
        type: 'phase_changee',
        titre: `${maj.programme} · passe en phase ${LIBELLES_PHASE[cible]}`,
        parId,
      }),
    );
    return versProjetExecution(maj);
  }

  // Fan-out de notifications en best-effort : un échec ne doit pas faire
  // échouer l'action métier (assignation / changement de phase).
  private async notifier(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.log.warn(
        `Notification non poussée : ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // -- Internes ------------------------------------------------------

  private async charger(societeId: string, id: string) {
    const projet = await this.prisma.projet.findFirst({
      where: { id, societeId },
      include: { cellules: true },
    });
    if (!projet) throw new NotFoundException('Projet introuvable');
    return projet;
  }

  // En-tête 1:1 + les lignes de sous-checklist par défaut + les 2 blocs fixes
  // (créés une fois, idempotent) — même motif que EtudesService.coquille /
  // UnbordService.assurerBlocs.
  private async coquilleAvantProjet(projetId: string) {
    await this.prisma.avantProjet.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
    // Les lignes n'ont plus de clé unique (items libres, ajoutables par
    // projet) : l'idempotence de l'amorçage se vérifie par comptage plutôt
    // que par skipDuplicates sur une clé.
    const existantes = await this.prisma.ligneChecklistAvp.count({
      where: { avantProjetId: projetId },
    });
    if (existantes === 0) {
      await this.prisma.ligneChecklistAvp.createMany({
        data: GABARIT_CHECKLIST_AVP.map(({ groupe, libelle, ordre }) => ({
          avantProjetId: projetId,
          groupe,
          libelle,
          ordre,
        })),
      });
    }
    await this.prisma.blocChecklistAvp.createMany({
      data: GROUPES_CHECKLIST_AVP.map((g) => ({ avantProjetId: projetId, groupe: g.groupe })),
      skipDuplicates: true,
    });
    return this.chargerAvantProjetComplet(projetId);
  }

  private chargerAvantProjetComplet(projetId: string) {
    return this.prisma.avantProjet.findUniqueOrThrow({
      where: { projetId },
      include: {
        dessinateur: { select: { id: true, prenom: true, nom: true } },
        responsable3d: { select: { id: true, prenom: true, nom: true } },
        // cellules exposées pour que le front limite le sélecteur d'assignation
        // de chaque bloc aux collaborateurs des équipes DU PROJET (pas toute
        // la société) — cf. GET …/collaborateurs?cellule=. Plusieurs équipes
        // possibles depuis sept. 2026 (décision boss).
        projet: { select: { cellules: { select: { celluleId: true } } } },
        lignesChecklist: true,
        blocsChecklist: {
          include: { responsable: { select: { id: true, prenom: true, nom: true } } },
        },
      },
    });
  }

  // Bloc libre = toute l'équipe agit (déjà vérifiée membre du projet par
  // AccesProjetGuard) — préservation explicite de la règle de septembre.
  // Bloc assigné = seul le responsable (+ admin), délégué à
  // verifierResponsableOuAdmin (dispatch-acces.ts, partagé avec
  // Permis/Exécution/Unbord).
  private async verifierAccesBlocChecklistAvp(
    societeId: string,
    projetId: string,
    groupe: GroupeChecklistAvp,
    utilisateurId: string,
    role: string,
  ): Promise<void> {
    const bloc = await this.prisma.blocChecklistAvp.findUnique({
      where: { avantProjetId_groupe: { avantProjetId: projetId, groupe } },
    });
    if (!bloc?.responsableId) return;
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc.responsableId);
  }

  private async trouverLigneChecklistAvp(avantProjetId: string, ligneId: string) {
    const ligne = await this.prisma.ligneChecklistAvp.findFirst({
      where: { id: ligneId, avantProjetId, supprimee: false },
    });
    if (!ligne) throw new NotFoundException('Item de checklist introuvable');
    return ligne;
  }

  // Coche automatiquement l'item dès qu'un fichier lui est rattaché — même
  // règle que Permis/Unbord (cf. mémoire, sept. 2026).
  private marquerFaitChecklistAvp(ligneId: string) {
    return this.prisma.ligneChecklistAvp.update({
      where: { id: ligneId },
      data: { fait: true, nonRequise: false },
    });
  }

  private async fichiersParLigneChecklistAvp(
    projetId: string,
  ): Promise<Map<string, FichierLigneChecklistAvp[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, ligneChecklistAvpId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistAvpId: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, ligneChecklistAvpId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistAvpId: true, ajouteLe: true },
      }),
    ]);
    const parLigne = new Map<string, FichierLigneChecklistAvp[]>();
    for (const img of images) {
      const arr = parLigne.get(img.ligneChecklistAvpId!) ?? [];
      arr.push({ id: img.id, nom: img.nom, url: img.cle, estImage: true, ajouteLe: img.ajouteLe });
      parLigne.set(img.ligneChecklistAvpId!, arr);
    }
    for (const f of fichiers) {
      const arr = parLigne.get(f.ligneChecklistAvpId!) ?? [];
      arr.push({ id: f.id, nom: f.nom, url: f.cle, estImage: false, ajouteLe: f.ajouteLe });
      parLigne.set(f.ligneChecklistAvpId!, arr);
    }
    for (const liste of parLigne.values()) {
      liste.sort((a, b) => +a.ajouteLe - +b.ajouteLe);
    }
    return parLigne;
  }

  private async versionsOrdonnees(projetId: string, categorie: Categorie) {
    const sequence = ETAPES_PRE_BILAN[categorie];
    const versions = await this.prisma.versionPreBilan.findMany({ where: { projetId } });
    return versions.sort(
      (a, b) => sequence.indexOf(a.etape) - sequence.indexOf(b.etape),
    );
  }
}
