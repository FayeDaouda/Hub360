import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupeChecklistPermis, Permis, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GABARIT_CHECKLIST_PERMIS, GROUPES_CHECKLIST_PERMIS } from '../domaine/config';
import { verifierFenetreBloc } from '../domaine/fenetre-bloc';
import { agitEnDirection, chargerProjet } from '../projet-acces';
import { estAutoriseAAssigner, verifierResponsableOuAdmin } from '../dispatch-acces';
import {
  AjouterLigneChecklistPermisDto,
  DeciderProlongationBlocDto,
  DemanderProlongationBlocDto,
  JoindreFichiersLigneDto,
  JoindreImagesLigneDto,
  PatchBlocPermisDto,
  PatchLigneChecklistPermisDto,
  PatchPermisDto,
} from './dto';

type LigneChecklistPermisAvecFaitPar = Prisma.LigneChecklistPermisGetPayload<{
  include: { faitPar: { select: { id: true; prenom: true; nom: true } } };
}>;

type BlocPermisAvecResponsable = Prisma.BlocPermisGetPayload<{
  include: { responsable: { select: { id: true; prenom: true; nom: true } } };
}>;

type FichierLigne = { id: string; nom: string; url: string; estImage: boolean; ajouteLe: Date };

// Correspondance clé front (snake_case, cf. PieceDossierPermis) ↔ colonne Prisma.
const PIECE_COLONNE = {
  titre_propriete: 'titrePropriete',
  plan_cadastral_vise: 'planCadastralVise',
  plans_apd: 'plansApd',
  devis: 'devis',
  timbre_fiscal: 'timbreFiscal',
} as const;

type CleFront = keyof typeof PIECE_COLONNE;

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function libelleBloc(groupe: GroupeChecklistPermis): string {
  return GROUPES_CHECKLIST_PERMIS.find((g) => g.groupe === groupe)?.libelle ?? groupe;
}

@Injectable()
export class PermisService {
  private readonly log = new Logger('Permis');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async get(societeId: string, projetId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const permis = await this.coquille(projetId);
    const lignes = await this.assurerChecklist(projetId);
    const blocs = await this.assurerBlocs(projetId);
    const [fichiersLigne, fichiersBloc] = await Promise.all([
      this.fichiersParLigne(projetId),
      this.fichiersParBloc(projetId),
    ]);
    return this.formater(
      permis,
      lignes,
      blocs,
      projet.cellules.map((c) => c.celluleId),
      fichiersLigne,
      fichiersBloc,
    );
  }

  // Dossier (5 pièces) / statut final — réservés au responsable du bloc
  // « Dossier de permis de construire » + admin : ce bloc recouvre le même
  // dossier administratif que ces champs historiques.
  async patch(
    societeId: string,
    projetId: string,
    dto: PatchPermisDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, projetId, 'conception');
    const actuel = await this.coquille(projetId);
    const blocs = await this.assurerBlocs(projetId);
    const blocDossier = blocs.find((b) => b.groupe === 'dossier_permis');
    await verifierResponsableOuAdmin(
      this.prisma,
      societeId,
      utilisateurId,
      role,
      blocDossier?.responsableId ?? null,
    );

    const statutSuivant = dto.statut ?? actuel.statut;

    const data: Prisma.PermisUpdateInput = {};
    if (dto.dossier) Object.assign(data, this.dossierColonnes(dto.dossier));
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.dateObtention !== undefined) {
      data.dateObtention = dto.dateObtention ? new Date(dto.dateObtention) : null;
    }
    if (dto.dateRefus !== undefined) {
      data.dateRefus = dto.dateRefus ? new Date(dto.dateRefus) : null;
    }

    // Horodatages posés d'office s'ils manquent (miroir du mock) ; effacés en
    // revenant à « en cours » puisqu'ils deviendraient trompeurs.
    if (statutSuivant === 'obtenu' && !actuel.dateObtention && data.dateObtention == null) {
      data.dateObtention = new Date();
    }
    if (statutSuivant === 'refuse' && !actuel.dateRefus && data.dateRefus == null) {
      data.dateRefus = new Date();
    }
    if (statutSuivant === 'a_deposer' && dto.statut !== undefined) {
      if (data.dateObtention === undefined) data.dateObtention = null;
      if (data.dateRefus === undefined) data.dateRefus = null;
    }

    await this.prisma.permis.update({ where: { projetId }, data });
    return this.get(societeId, projetId);
  }

  // -- Sous-checklist opérationnelle (LigneChecklistPermis) -----------------

  async patchLigneChecklist(
    societeId: string,
    id: string,
    ligneId: string,
    dto: PatchLigneChecklistPermisDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    await this.assurerChecklist(id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistPermis.findFirst({
      where: { id: ligneId, permisId: id, supprimee: false },
      select: { groupe: true },
    });
    if (!ligne) throw new NotFoundException('Item de checklist introuvable');
    const bloc = blocs.find((b) => b.groupe === ligne.groupe);
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc?.responsableId ?? null);

    const data: Prisma.LigneChecklistPermisUncheckedUpdateManyInput = {};
    if (dto.fait !== undefined) {
      data.fait = dto.fait;
      data.faitParId = dto.fait ? utilisateurId : null;
      data.faitLe = dto.fait ? new Date() : null;
    }
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.nonRequise !== undefined) {
      data.nonRequise = dto.nonRequise;
      // Mutuellement exclusif avec « fait » — un item désactivé n'est pas
      // « fait », il est hors sujet (décision boss, sept. 2026).
      if (dto.nonRequise) {
        data.fait = false;
        data.faitParId = null;
        data.faitLe = null;
      }
    }

    await this.prisma.ligneChecklistPermis.updateMany({
      where: { id: ligneId, permisId: id, supprimee: false },
      data,
    });
    return this.get(societeId, id);
  }

  // Ajout d'un item de checklist propre à ce projet — admin uniquement.
  async ajouterLigneChecklist(
    societeId: string,
    id: string,
    dto: AjouterLigneChecklistPermisDto,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    await this.assurerChecklist(id);

    const { _max } = await this.prisma.ligneChecklistPermis.aggregate({
      where: { permisId: id, groupe: dto.groupe },
      _max: { ordre: true },
    });
    await this.prisma.ligneChecklistPermis.create({
      data: {
        permisId: id,
        groupe: dto.groupe,
        libelle: dto.libelle,
        ordre: (_max.ordre ?? -1) + 1,
      },
    });
    return this.get(societeId, id);
  }

  // Suppression douce — admin uniquement.
  async supprimerLigneChecklist(
    societeId: string,
    id: string,
    ligneId: string,
    utilisateurId: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    const { count } = await this.prisma.ligneChecklistPermis.updateMany({
      where: { id: ligneId, permisId: id, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId: utilisateurId },
    });
    if (count === 0) throw new NotFoundException('Item de checklist introuvable');
    return this.get(societeId, id);
  }

  // -- Blocs (Dossier de permis / Dépôt urbanisme / Procédure) --------------
  // Échéance + responsable par bloc — pas au niveau du module ni de l'item.

  // PATCH …/permis/blocs/:groupe — admin OU dispatcher de la cellule du
  // responsable ciblé (décision boss, sept. 2026 ; cf. dispatch-acces.ts).
  async patchBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistPermis,
    dto: PatchBlocPermisDto,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);
    const avant = blocs.find((b) => b.groupe === groupe);
    if (!avant) throw new NotFoundException('Bloc introuvable');

    if (!agitEnDirection(role)) {
      const cibleId = dto.responsableId !== undefined ? dto.responsableId : avant.responsableId;
      const autorise = await estAutoriseAAssigner(
        this.prisma,
        societeId,
        utilisateurId,
        cibleId,
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
    const data: Prisma.BlocPermisUpdateInput = {};
    if (dto.debut !== undefined) data.debut = dto.debut;
    if (dto.echeance !== undefined) data.echeance = dto.echeance;
    if (dto.responsableId !== undefined) {
      data.responsable = dto.responsableId
        ? { connect: { id: dto.responsableId } }
        : { disconnect: true };
    }

    await this.prisma.blocPermis.update({
      where: { permisId_groupe: { permisId: id, groupe } },
      data,
    });

    // Nouveau responsable (ou bloc libéré) : la remise/validation de l'ancien
    // ne le suit pas — le circuit repart de zéro (RH lot 5c).
    if (dto.responsableId !== undefined && dto.responsableId !== avant.responsableId) {
      await this.prisma.validationTache.deleteMany({ where: { section: 'permis', projetId: id, groupe } });
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
            titre: `${libelleBloc(groupe)} · responsable désigné sur ${projet.programme}`,
            parId: utilisateurId,
            destinataireIds: [destinataireId],
          }),
        );
      }
    }

    return this.get(societeId, id);
  }

  // POST …/permis/blocs/:groupe/prolongation — le responsable DE CE BLOC
  // uniquement (vérifié ici, pas au niveau du guard).
  async demanderProlongationBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistPermis,
    dto: DemanderProlongationBlocDto,
    utilisateurId: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);
    const bloc = blocs.find((b) => b.groupe === groupe);

    const collab = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId, societeId },
      select: { id: true },
    });
    if (!collab) throw new ForbiddenException('Aucune fiche collaborateur pour ce compte');
    if (!bloc?.responsableId || bloc.responsableId !== collab.id) {
      throw new ForbiddenException("Tu n'es pas le responsable désigné de ce bloc.");
    }

    await this.prisma.blocPermis.update({
      where: { permisId_groupe: { permisId: id, groupe } },
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
          titre: `${libelleBloc(groupe)} · prolongation demandée sur ${projet.programme}`,
          parId: utilisateurId,
          destinataireIds: adminIds,
        }),
      );
    }

    return this.get(societeId, id);
  }

  // PATCH …/permis/blocs/:groupe/prolongation — admin uniquement.
  async deciderProlongationBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistPermis,
    dto: DeciderProlongationBlocDto,
    utilisateurId: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id, 'conception');
    const bloc = await this.chargerBloc(id, groupe);
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    if (!bloc.prolongationDemandeeLe) {
      throw new ConflictException('Aucune demande de prolongation en attente sur ce bloc');
    }

    const data: Prisma.BlocPermisUpdateInput = {
      prolongationDemandeeLe: null,
      prolongationEcheance: null,
      prolongationMotif: null,
    };
    if (dto.accepter) data.echeance = bloc.prolongationEcheance;

    await this.prisma.blocPermis.update({
      where: { permisId_groupe: { permisId: id, groupe } },
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
            titre: `${libelleBloc(groupe)} · prolongation ${dto.accepter ? 'acceptée' : 'refusée'} sur ${projet.programme}`,
            parId: utilisateurId,
            destinataireIds: [destinataireId],
          }),
        );
      }
    }

    return this.get(societeId, id);
  }

  // -- Pièces jointes rattachées à une ligne --------------------------------
  // Même stockage que les modules Images/Documents (ImageProjet/FichierProjet)
  // — pas de copie : juste `ligneChecklistPermisId` + `phase: 'permis'` posés
  // ici, ce qui les fait apparaître naturellement dans ces deux modules ET
  // sur leur ligne de checklist (cf. fichiersParLigne). Réservé au responsable
  // du bloc de cette ligne + admin, comme le reste de l'écriture ici.

  async joindreImages(
    societeId: string,
    id: string,
    ligneId: string,
    dto: JoindreImagesLigneDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistPermis.findFirst({
      where: { id: ligneId, permisId: id, supprimee: false },
      select: { groupe: true },
    });
    if (!ligne) throw new NotFoundException('Item de checklist introuvable');
    const bloc = blocs.find((b) => b.groupe === ligne.groupe);
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc?.responsableId ?? null);

    await this.prisma.$transaction([
      this.prisma.imageProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId: id,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          phase: 'permis' as const,
          // Dossier administratif / plans techniques, pas des photos du
          // bâtiment — « autre » plutôt que forcer une valeur qui ne
          // correspondrait pas (sept. 2026, cf. schema.prisma::TypePhotoImage).
          typePhoto: 'autre' as const,
          ligneChecklistPermisId: ligneId,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFaitApresUpload(ligneId, utilisateurId),
    ]);

    return this.get(societeId, id);
  }

  async joindreFichiers(
    societeId: string,
    id: string,
    ligneId: string,
    dto: JoindreFichiersLigneDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistPermis.findFirst({
      where: { id: ligneId, permisId: id, supprimee: false },
      select: { groupe: true },
    });
    if (!ligne) throw new NotFoundException('Item de checklist introuvable');
    const bloc = blocs.find((b) => b.groupe === ligne.groupe);
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc?.responsableId ?? null);

    await this.prisma.$transaction([
      this.prisma.fichierProjet.createMany({
        data: dto.fichiers.map((f) => ({
          projetId: id,
          cle: f.url,
          nom: f.nom,
          typeMime: typeMimeDepuisDataUri(f.url),
          taille: f.taille ?? 0,
          phase: 'permis' as const,
          ligneChecklistPermisId: ligneId,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFaitApresUpload(ligneId, utilisateurId),
    ]);

    return this.get(societeId, id);
  }

  // -- Pièces jointes rattachées au BLOC entier (pas à un item précis) ------
  // Dépôt urbanisme / Procédure depuis la restructuration sept. 2026 : un
  // seul point d'upload partagé par bloc, plutôt qu'un bouton « joindre »
  // par item. Même autorisation que joindreImages/joindreFichiers
  // (responsable du bloc + admin).

  async joindreImagesBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistPermis,
    dto: JoindreImagesLigneDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);
    const bloc = blocs.find((b) => b.groupe === groupe);
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc.responsableId);

    await this.prisma.imageProjet.createMany({
      data: dto.fichiers.map((f) => ({
        projetId: id,
        cle: f.url,
        nom: f.nom,
        typeMime: typeMimeDepuisDataUri(f.url),
        phase: 'permis' as const,
        typePhoto: 'autre' as const,
        blocPermisPermisId: id,
        blocPermisGroupe: groupe,
        ajouteParId: utilisateurId,
      })),
    });

    return this.get(societeId, id);
  }

  async joindreFichiersBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistPermis,
    dto: JoindreFichiersLigneDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id, 'conception');
    await this.coquille(id);
    const blocs = await this.assurerBlocs(id);
    const bloc = blocs.find((b) => b.groupe === groupe);
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc.responsableId);

    await this.prisma.fichierProjet.createMany({
      data: dto.fichiers.map((f) => ({
        projetId: id,
        cle: f.url,
        nom: f.nom,
        typeMime: typeMimeDepuisDataUri(f.url),
        taille: f.taille ?? 0,
        phase: 'permis' as const,
        blocPermisPermisId: id,
        blocPermisGroupe: groupe,
        ajouteParId: utilisateurId,
      })),
    });

    return this.get(societeId, id);
  }

  // -- Internes ------------------------------------------------------------

  // Coche automatiquement l'item dès qu'un fichier lui est rattaché — demande
  // explicite sept. 2026 (« un item avec un fichier uploadé doit être coché
  // fait automatiquement »). Lève aussi nonRequise, cohérent avec l'idée
  // qu'un fichier joint prouve que l'item concernait bien le projet.
  private marquerFaitApresUpload(ligneId: string, utilisateurId: string) {
    return this.prisma.ligneChecklistPermis.update({
      where: { id: ligneId },
      data: { fait: true, faitParId: utilisateurId, faitLe: new Date(), nonRequise: false },
    });
  }

  private async notifier(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.log.warn(`Notification non poussée : ${e instanceof Error ? e.message : e}`);
    }
  }

  // verifierResponsableOuAdmin extrait dans dispatch-acces.ts (2026-09-25) —
  // partagé avec Exécution et Unbord, plus de copie locale ici.

  // Amorce les lignes standard une fois (idempotent, comme coquilleAvantProjet) —
  // items libres ensuite, ajoutables/supprimables par projet.
  private async assurerChecklist(projetId: string) {
    const existantes = await this.prisma.ligneChecklistPermis.count({
      where: { permisId: projetId },
    });
    if (existantes === 0) {
      // skipDuplicates : filet de sécurité si une requête concurrente a
      // gagné la course entre le count ci-dessus et cet insert (2 onglets,
      // double montage React StrictMode…) — cf. @@unique([permisId, groupe,
      // ordre]) sur le modèle.
      await this.prisma.ligneChecklistPermis.createMany({
        data: GABARIT_CHECKLIST_PERMIS.map(({ groupe, libelle, ordre }) => ({
          permisId: projetId,
          groupe,
          libelle,
          ordre,
        })),
        skipDuplicates: true,
      });
    }
    return this.chargerChecklist(projetId);
  }

  private chargerChecklist(projetId: string): Promise<LigneChecklistPermisAvecFaitPar[]> {
    return this.prisma.ligneChecklistPermis.findMany({
      where: { permisId: projetId },
      include: {
        faitPar: { select: { id: true, prenom: true, nom: true } },
      },
    });
  }

  // Amorce les 3 blocs fixes une fois — idempotent grâce à la clé composite
  // (permisId, groupe), pas besoin d'un count préalable comme assurerChecklist.
  private async assurerBlocs(permisId: string): Promise<BlocPermisAvecResponsable[]> {
    await this.prisma.blocPermis.createMany({
      data: GROUPES_CHECKLIST_PERMIS.map((g) => ({ permisId, groupe: g.groupe })),
      skipDuplicates: true,
    });
    return this.chargerBlocs(permisId);
  }

  private chargerBlocs(permisId: string): Promise<BlocPermisAvecResponsable[]> {
    return this.prisma.blocPermis.findMany({
      where: { permisId },
      include: { responsable: { select: { id: true, prenom: true, nom: true } } },
    });
  }

  private chargerBloc(
    permisId: string,
    groupe: GroupeChecklistPermis,
  ): Promise<BlocPermisAvecResponsable | null> {
    return this.prisma.blocPermis.findUnique({
      where: { permisId_groupe: { permisId, groupe } },
      include: { responsable: { select: { id: true, prenom: true, nom: true } } },
    });
  }

  // Fichiers/images déjà rattachés à une ligne — 2 requêtes groupées plutôt
  // qu'une par item (25 items × 2 tables serait inutilement coûteux).
  private async fichiersParLigne(projetId: string): Promise<Map<string, FichierLigne[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, ligneChecklistPermisId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistPermisId: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, ligneChecklistPermisId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistPermisId: true, ajouteLe: true },
      }),
    ]);

    const parLigne = new Map<string, FichierLigne[]>();
    const ajouter = (ligneId: string, item: FichierLigne) => {
      const liste = parLigne.get(ligneId) ?? [];
      liste.push(item);
      parLigne.set(ligneId, liste);
    };
    for (const img of images) {
      ajouter(img.ligneChecklistPermisId as string, {
        id: img.id,
        nom: img.nom,
        url: img.cle,
        estImage: true,
        ajouteLe: img.ajouteLe,
      });
    }
    for (const f of fichiers) {
      ajouter(f.ligneChecklistPermisId as string, {
        id: f.id,
        nom: f.nom,
        url: f.cle,
        estImage: false,
        ajouteLe: f.ajouteLe,
      });
    }
    for (const liste of parLigne.values()) {
      liste.sort((a, b) => +a.ajouteLe - +b.ajouteLe);
    }
    return parLigne;
  }

  // Fichiers/images rattachés au BLOC entier (pas à un item précis) — Dépôt
  // urbanisme / Procédure depuis la restructuration sept. 2026 : un seul
  // point d'upload partagé, cf. joindreImagesBloc/joindreFichiersBloc.
  private async fichiersParBloc(
    projetId: string,
  ): Promise<Map<GroupeChecklistPermis, FichierLigne[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, blocPermisPermisId: projetId, supprimee: false },
        select: { id: true, nom: true, cle: true, blocPermisGroupe: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, blocPermisPermisId: projetId, supprimee: false },
        select: { id: true, nom: true, cle: true, blocPermisGroupe: true, ajouteLe: true },
      }),
    ]);

    const parBloc = new Map<GroupeChecklistPermis, FichierLigne[]>();
    const ajouter = (groupe: GroupeChecklistPermis, item: FichierLigne) => {
      const liste = parBloc.get(groupe) ?? [];
      liste.push(item);
      parBloc.set(groupe, liste);
    };
    for (const img of images) {
      ajouter(img.blocPermisGroupe as GroupeChecklistPermis, {
        id: img.id,
        nom: img.nom,
        url: img.cle,
        estImage: true,
        ajouteLe: img.ajouteLe,
      });
    }
    for (const f of fichiers) {
      ajouter(f.blocPermisGroupe as GroupeChecklistPermis, {
        id: f.id,
        nom: f.nom,
        url: f.cle,
        estImage: false,
        ajouteLe: f.ajouteLe,
      });
    }
    for (const liste of parBloc.values()) {
      liste.sort((a, b) => +a.ajouteLe - +b.ajouteLe);
    }
    return parBloc;
  }

  private coquille(projetId: string): Promise<Permis> {
    return this.prisma.permis.upsert({
      where: { projetId },
      update: {},
      create: { projetId },
    });
  }

  private dossierFront(p: Permis): Record<CleFront, boolean> {
    return {
      titre_propriete: p.titrePropriete,
      plan_cadastral_vise: p.planCadastralVise,
      plans_apd: p.plansApd,
      devis: p.devis,
      timbre_fiscal: p.timbreFiscal,
    };
  }

  private dossierColonnes(dossier: Record<string, boolean>) {
    const cols: Record<string, boolean> = {};
    for (const [cle, colonne] of Object.entries(PIECE_COLONNE)) {
      if (dossier[cle] !== undefined) cols[colonne] = dossier[cle];
    }
    return cols;
  }

  private formater(
    p: Permis,
    lignes: LigneChecklistPermisAvecFaitPar[],
    blocs: BlocPermisAvecResponsable[],
    celluleIds: string[],
    fichiersParLigne: Map<string, FichierLigne[]>,
    fichiersParBloc: Map<GroupeChecklistPermis, FichierLigne[]>,
  ) {
    const { titrePropriete, planCadastralVise, plansApd, devis, timbreFiscal, ...reste } = p;

    const parGroupeLignes = new Map<string, LigneChecklistPermisAvecFaitPar[]>();
    for (const l of lignes) {
      if (l.supprimee) continue;
      const arr = parGroupeLignes.get(l.groupe) ?? [];
      arr.push(l);
      parGroupeLignes.set(l.groupe, arr);
    }
    const parGroupeBloc = new Map(blocs.map((b) => [b.groupe, b]));
    const ref = (c: { id: string; prenom: string; nom: string } | null) =>
      c ? { id: c.id, nom: `${c.prenom} ${c.nom}`.trim() } : null;

    return {
      ...reste,
      // Équipe(s) à proposer dans le sélecteur de responsable de chaque bloc
      // (front : GET …/collaborateurs?cellule=), comme AvantProjet. Plusieurs
      // possibles depuis sept. 2026 (décision boss).
      celluleIds,
      dossier: {
        titre_propriete: titrePropriete,
        plan_cadastral_vise: planCadastralVise,
        plans_apd: plansApd,
        devis,
        timbre_fiscal: timbreFiscal,
      },
      checklists: GROUPES_CHECKLIST_PERMIS.map((g) => {
        const bloc = parGroupeBloc.get(g.groupe);
        return {
          groupe: g.groupe,
          libelle: g.libelle,
          description: g.description,
          debut: bloc?.debut ?? null,
          echeance: bloc?.echeance ?? null,
          responsable: ref(bloc?.responsable ?? null),
          prolongationDemandeeLe: bloc?.prolongationDemandeeLe ?? null,
          prolongationEcheance: bloc?.prolongationEcheance ?? null,
          prolongationMotif: bloc?.prolongationMotif ?? null,
          // Point d'upload partagé du bloc (Dépôt urbanisme / Procédure) —
          // toujours vide pour Constitution, qui n'en a pas besoin (son item
          // unique reçoit déjà directement ses fichiers).
          fichiersBloc: fichiersParBloc.get(g.groupe) ?? [],
          items: (parGroupeLignes.get(g.groupe) ?? [])
            .sort((a, b) => a.ordre - b.ordre)
            .map((l) => ({
              id: l.id,
              libelle: l.libelle,
              fait: l.fait,
              nonRequise: l.nonRequise,
              note: l.note,
              faitPar: ref(l.faitPar),
              faitLe: l.faitLe,
              fichiers: fichiersParLigne.get(l.id) ?? [],
            })),
        };
      }),
    };
  }
}
