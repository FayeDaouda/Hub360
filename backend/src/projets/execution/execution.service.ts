import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupeChecklistExecution, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GABARIT_CHECKLIST_EXECUTION, GROUPES_CHECKLIST_EXECUTION } from '../domaine/config';
import { verifierFenetreBloc } from '../domaine/fenetre-bloc';
import { agitEnDirection, chargerProjet } from '../projet-acces';
import { estAutoriseAAssigner, verifierResponsableOuAdmin } from '../dispatch-acces';
import {
  AjouterLigneChecklistExecutionDto,
  DeciderProlongationBlocExecutionDto,
  DemanderProlongationBlocExecutionDto,
  JoindreFichiersLigneDto,
  JoindreImagesLigneDto,
  PatchBlocExecutionDto,
  PatchLigneChecklistExecutionDto,
} from './dto';

type LigneChecklistExecutionAvecFaitPar = Prisma.LigneChecklistExecutionGetPayload<{
  include: { faitPar: { select: { id: true; prenom: true; nom: true } } };
}>;

type BlocExecutionAvecResponsable = Prisma.BlocExecutionGetPayload<{
  include: { responsable: { select: { id: true; prenom: true; nom: true } } };
}>;

type FichierLigne = { id: string; nom: string; url: string; estImage: boolean; ajouteLe: Date };

function typeMimeDepuisDataUri(url: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(url);
  return m ? m[1] : '';
}

function libelleBloc(groupe: GroupeChecklistExecution): string {
  return GROUPES_CHECKLIST_EXECUTION.find((g) => g.groupe === groupe)?.libelle ?? groupe;
}

@Injectable()
export class ExecutionService {
  private readonly log = new Logger('Execution');
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async get(societeId: string, projetId: string) {
    const projet = await chargerProjet(this.prisma, societeId, projetId);
    const lignes = await this.assurerChecklist(projetId);
    const blocs = await this.assurerBlocs(projetId);
    return this.formater(
      projetId,
      projet.cellules.map((c) => c.celluleId),
      lignes,
      blocs,
      await this.fichiersParLigne(projetId),
    );
  }

  // -- Sous-checklist opérationnelle (LigneChecklistExecution) --------------

  async patchLigneChecklist(
    societeId: string,
    id: string,
    ligneId: string,
    dto: PatchLigneChecklistExecutionDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id);
    await this.assurerChecklist(id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistExecution.findFirst({
      where: { id: ligneId, projetId: id, supprimee: false },
      select: { groupe: true },
    });
    if (!ligne) throw new NotFoundException('Item de checklist introuvable');
    const bloc = blocs.find((b) => b.groupe === ligne.groupe);
    await verifierResponsableOuAdmin(this.prisma, societeId, utilisateurId, role, bloc?.responsableId ?? null);

    const data: Prisma.LigneChecklistExecutionUncheckedUpdateManyInput = {};
    if (dto.fait !== undefined) {
      data.fait = dto.fait;
      data.faitParId = dto.fait ? utilisateurId : null;
      data.faitLe = dto.fait ? new Date() : null;
    }
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.nonRequise !== undefined) {
      data.nonRequise = dto.nonRequise;
      // Mutuellement exclusif avec « fait » — même règle que Permis.
      if (dto.nonRequise) {
        data.fait = false;
        data.faitParId = null;
        data.faitLe = null;
      }
    }

    await this.prisma.ligneChecklistExecution.updateMany({
      where: { id: ligneId, projetId: id, supprimee: false },
      data,
    });
    return this.get(societeId, id);
  }

  // Ajout d'un item de checklist propre à ce projet — admin uniquement.
  async ajouterLigneChecklist(
    societeId: string,
    id: string,
    dto: AjouterLigneChecklistExecutionDto,
  ) {
    await chargerProjet(this.prisma, societeId, id);
    await this.assurerChecklist(id);

    const { _max } = await this.prisma.ligneChecklistExecution.aggregate({
      where: { projetId: id, groupe: dto.groupe },
      _max: { ordre: true },
    });
    await this.prisma.ligneChecklistExecution.create({
      data: {
        projetId: id,
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
    await chargerProjet(this.prisma, societeId, id);
    const { count } = await this.prisma.ligneChecklistExecution.updateMany({
      where: { id: ligneId, projetId: id, supprimee: false },
      data: { supprimee: true, supprimeLe: new Date(), supprimeParId: utilisateurId },
    });
    if (count === 0) throw new NotFoundException('Item de checklist introuvable');
    return this.get(societeId, id);
  }

  // -- Blocs (Études / Les Plans / Viabilité / Locaux techniques /
  // Aménagements / Cahiers de menuiserie / Détails / CCTP) ------------------

  // PATCH …/execution/blocs/:groupe — admin OU dispatcher de la cellule du
  // responsable ciblé (décision boss, sept. 2026 ; cf. dispatch-acces.ts).
  async patchBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistExecution,
    dto: PatchBlocExecutionDto,
    utilisateurId: string,
    role: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id);
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
    const data: Prisma.BlocExecutionUpdateInput = {};
    if (dto.debut !== undefined) data.debut = dto.debut;
    if (dto.echeance !== undefined) data.echeance = dto.echeance;
    if (dto.responsableId !== undefined) {
      data.responsable = dto.responsableId
        ? { connect: { id: dto.responsableId } }
        : { disconnect: true };
    }

    await this.prisma.blocExecution.update({
      where: { projetId_groupe: { projetId: id, groupe } },
      data,
    });

    // Nouveau responsable (ou bloc libéré) : la remise/validation de l'ancien
    // ne le suit pas — le circuit repart de zéro (RH lot 5c).
    if (dto.responsableId !== undefined && dto.responsableId !== avant.responsableId) {
      await this.prisma.validationTache.deleteMany({ where: { section: 'execution', projetId: id, groupe } });
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

  // POST …/execution/blocs/:groupe/prolongation — le responsable DE CE BLOC
  // uniquement (vérifié ici, pas au niveau du guard).
  async demanderProlongationBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistExecution,
    dto: DemanderProlongationBlocExecutionDto,
    utilisateurId: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id);
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

    await this.prisma.blocExecution.update({
      where: { projetId_groupe: { projetId: id, groupe } },
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

  // PATCH …/execution/blocs/:groupe/prolongation — admin uniquement.
  async deciderProlongationBloc(
    societeId: string,
    id: string,
    groupe: GroupeChecklistExecution,
    dto: DeciderProlongationBlocExecutionDto,
    utilisateurId: string,
  ) {
    const projet = await chargerProjet(this.prisma, societeId, id);
    const bloc = await this.chargerBloc(id, groupe);
    if (!bloc) throw new NotFoundException('Bloc introuvable');
    if (!bloc.prolongationDemandeeLe) {
      throw new ConflictException('Aucune demande de prolongation en attente sur ce bloc');
    }

    const data: Prisma.BlocExecutionUpdateInput = {
      prolongationDemandeeLe: null,
      prolongationEcheance: null,
      prolongationMotif: null,
    };
    if (dto.accepter) data.echeance = bloc.prolongationEcheance;

    await this.prisma.blocExecution.update({
      where: { projetId_groupe: { projetId: id, groupe } },
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
  // — pas de copie : juste `ligneChecklistExecutionId` + `phase: 'chantier'`
  // posés ici. Réservé au responsable du bloc de cette ligne + admin, comme
  // le reste de l'écriture ici.

  async joindreImages(
    societeId: string,
    id: string,
    ligneId: string,
    dto: JoindreImagesLigneDto,
    utilisateurId: string,
    role: string,
  ) {
    await chargerProjet(this.prisma, societeId, id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistExecution.findFirst({
      where: { id: ligneId, projetId: id, supprimee: false },
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
          phase: 'chantier' as const,
          typePhoto: 'chantier' as const,
          ligneChecklistExecutionId: ligneId,
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
    await chargerProjet(this.prisma, societeId, id);
    const blocs = await this.assurerBlocs(id);

    const ligne = await this.prisma.ligneChecklistExecution.findFirst({
      where: { id: ligneId, projetId: id, supprimee: false },
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
          phase: 'chantier' as const,
          ligneChecklistExecutionId: ligneId,
          ajouteParId: utilisateurId,
        })),
      }),
      this.marquerFaitApresUpload(ligneId, utilisateurId),
    ]);

    return this.get(societeId, id);
  }

  // -- Internes ------------------------------------------------------------

  // Coche automatiquement l'item dès qu'un fichier lui est rattaché — même
  // règle que PermisService.marquerFaitApresUpload (cf. mémoire, sept. 2026).
  private marquerFaitApresUpload(ligneId: string, utilisateurId: string) {
    return this.prisma.ligneChecklistExecution.update({
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
  // partagé avec Permis et Unbord, plus de copie locale ici.

  // Amorce les lignes standard une fois (idempotent) — items libres ensuite,
  // ajoutables/supprimables par projet.
  private async assurerChecklist(projetId: string) {
    const existantes = await this.prisma.ligneChecklistExecution.count({
      where: { projetId },
    });
    if (existantes === 0) {
      // skipDuplicates : filet de sécurité si une requête concurrente a
      // gagné la course entre le count ci-dessus et cet insert (2 onglets,
      // double montage React StrictMode…) — cf. @@unique([projetId, groupe,
      // ordre]) sur le modèle.
      await this.prisma.ligneChecklistExecution.createMany({
        data: GABARIT_CHECKLIST_EXECUTION.map(({ groupe, libelle, ordre }) => ({
          projetId,
          groupe,
          libelle,
          ordre,
        })),
        skipDuplicates: true,
      });
    }
    return this.chargerChecklist(projetId);
  }

  private chargerChecklist(projetId: string): Promise<LigneChecklistExecutionAvecFaitPar[]> {
    return this.prisma.ligneChecklistExecution.findMany({
      where: { projetId },
      include: {
        faitPar: { select: { id: true, prenom: true, nom: true } },
      },
    });
  }

  // Amorce les 8 blocs fixes une fois — idempotent grâce à la clé composite
  // (projetId, groupe), pas besoin d'un count préalable comme assurerChecklist.
  private async assurerBlocs(projetId: string): Promise<BlocExecutionAvecResponsable[]> {
    await this.prisma.blocExecution.createMany({
      data: GROUPES_CHECKLIST_EXECUTION.map((g) => ({ projetId, groupe: g.groupe })),
      skipDuplicates: true,
    });
    return this.chargerBlocs(projetId);
  }

  private chargerBlocs(projetId: string): Promise<BlocExecutionAvecResponsable[]> {
    return this.prisma.blocExecution.findMany({
      where: { projetId },
      include: { responsable: { select: { id: true, prenom: true, nom: true } } },
    });
  }

  private chargerBloc(
    projetId: string,
    groupe: GroupeChecklistExecution,
  ): Promise<BlocExecutionAvecResponsable | null> {
    return this.prisma.blocExecution.findUnique({
      where: { projetId_groupe: { projetId, groupe } },
      include: { responsable: { select: { id: true, prenom: true, nom: true } } },
    });
  }

  // Fichiers/images déjà rattachés à une ligne — 2 requêtes groupées plutôt
  // qu'une par item.
  private async fichiersParLigne(projetId: string): Promise<Map<string, FichierLigne[]>> {
    const [images, fichiers] = await Promise.all([
      this.prisma.imageProjet.findMany({
        where: { projetId, ligneChecklistExecutionId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistExecutionId: true, ajouteLe: true },
      }),
      this.prisma.fichierProjet.findMany({
        where: { projetId, ligneChecklistExecutionId: { not: null }, supprimee: false },
        select: { id: true, nom: true, cle: true, ligneChecklistExecutionId: true, ajouteLe: true },
      }),
    ]);

    const parLigne = new Map<string, FichierLigne[]>();
    const ajouter = (ligneId: string, item: FichierLigne) => {
      const liste = parLigne.get(ligneId) ?? [];
      liste.push(item);
      parLigne.set(ligneId, liste);
    };
    for (const img of images) {
      ajouter(img.ligneChecklistExecutionId as string, {
        id: img.id,
        nom: img.nom,
        url: img.cle,
        estImage: true,
        ajouteLe: img.ajouteLe,
      });
    }
    for (const f of fichiers) {
      ajouter(f.ligneChecklistExecutionId as string, {
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

  private formater(
    projetId: string,
    celluleIds: string[],
    lignes: LigneChecklistExecutionAvecFaitPar[],
    blocs: BlocExecutionAvecResponsable[],
    fichiersParLigne: Map<string, FichierLigne[]>,
  ) {
    const parGroupeLignes = new Map<string, LigneChecklistExecutionAvecFaitPar[]>();
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
      projetId,
      // Équipe(s) à proposer dans le sélecteur de responsable de chaque bloc
      // (front : GET …/collaborateurs?cellule=), comme Permis. Plusieurs
      // possibles depuis sept. 2026 (décision boss).
      celluleIds,
      checklists: GROUPES_CHECKLIST_EXECUTION.map((g) => {
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
