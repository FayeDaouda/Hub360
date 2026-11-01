import { ApiProperty } from '@nestjs/swagger';
import { StatutTacheProjet, TypeClient } from '@prisma/client';
import type { StatutDevisEffectif } from '../devis/domaine';
import type { SiteStatus, TrancheStatus } from './project-query';
import {
  CARD_STATE_VARIANTS,
  oneOfVariants,
  REVIEWER_VARIANTS,
  TASK_STATE_VARIANTS,
  TIME_VARIANTS,
  type CardStateDto,
  type ReviewerDto,
  type TaskStateDto,
  type TimeDto,
} from './project-state.dto';
import type { StepState } from './task-states';

// Réponse de GET /societes/:slug/projets-ouverts/:id (dossier d'un projet
// ouvert, maquette « Projets ») : étapes, cartes, tâches, leurs états du jour
// et ce que la personne connectée peut y faire. TypeScript vérifie que
// ProjectFileService.file la respecte. Noms des champs : ceux de l'API.

export class ProjectClientDto {
  nom!: string;
  type!: TypeClient;
}

export class OpenProjectCellDto {
  nom!: string;
  chef!: string | null;
}

export class TemplateVersionDto {
  code!: string;
  libelle!: string;
}

// Statut de chaque tranche de facturation (F1 à l'ouverture, F2, F3).
export class TrancheStatusesDto {
  F1!: TrancheStatus;
  F2!: TrancheStatus;
  F3!: TrancheStatus;
}

// Ce qu'attend chaque tranche avant de pouvoir être émise (étapes, visas…).
export class InvoiceWaitsDto {
  F2!: string[];
  F3!: string[];
}

// « Ajouter en TS » : cartes « par unité » actives.
export class TsOptionDto {
  carteId!: string;
  libelle!: string;
  heures!: number;
}

export class ProjectStepDto {
  numero!: number;
  faites!: number;
  total!: number;
  enRetard!: number;
  etat!: StepState;
  cle!: string;
  libelle!: string;
}

// Fichier d'une remise (v01, v02…), sans son contenu.
export class SubmissionPieceDto {
  id!: string;
  nom!: string;
  version!: number;
}

// Élément TS : devis d'avenant qui le facture et son état.
export class TsQuoteDto {
  devisId!: string;
  reference!: string | null;
  statut!: StatutDevisEffectif;
}

// Visa DPLG exigé : apposé le… par… (null tant qu'il ne l'est pas).
export class TaskVisaStateDto {
  le!: string | null;
  par!: string | null;
  nonTrace!: boolean;
}

export class TaskAssigneeDto {
  id!: string;
  nom!: string;
  cellule!: string | null;
}

export class PendingExtensionDto {
  jusquau!: string;
  motif!: string;
  le!: string | null;
}

export class TaskExtensionsDto {
  enAttente!: PendingExtensionDto | null;
  accordeeJusquau!: string | null;
}

export class ProjectTaskDto {
  id!: string;
  cle!: string;
  libelle!: string;
  // Ligne ajoutée à ce projet (absente de sa version du gabarit).
  ajouteeAuProjet!: boolean;
  descriptif!: string | null;
  sourceNative!: boolean;
  fichierObligatoire!: boolean;
  debutJ!: number | null;
  finJ!: number | null;
  debutLe!: string | null;
  finLe!: string | null;
  @ApiProperty({ oneOf: oneOfVariants(TIME_VARIANTS) })
  temps!: TimeDto;
  heures!: number | null;
  statut!: StatutTacheProjet;
  motif!: string | null;
  version!: number;
  pieces!: SubmissionPieceDto[];
  avenant!: TsQuoteDto | null;
  valideeLe!: string | null;
  valideePar!: string | null;
  visa!: TaskVisaStateDto | null;
  peutViser!: boolean;
  assigne!: TaskAssigneeDto | null;
  // Assignée à la personne connectée (« Seulement mes tâches »).
  aMoi!: boolean;
  @ApiProperty({ oneOf: oneOfVariants(REVIEWER_VARIANTS) })
  validation!: ReviewerDto;
  peutDecider!: boolean;
  prolongation!: TaskExtensionsDto;
  peutDemanderProlongation!: boolean;
  peutDeciderProlongation!: boolean;
  peutRemettre!: boolean;
  // Base du nom des fichiers du prochain dépôt (FS_POI.26_04_TIMBRE-FISCAL_v02),
  // sans rang ni extension : règle du serveur (submission-file-name.ts).
  nomDepot!: string;
  fil!: number; // messages du fil de la tâche
  @ApiProperty({ oneOf: oneOfVariants(TASK_STATE_VARIANTS) })
  etat!: TaskStateDto;
}

export class ProjectCardDto {
  id!: string;
  etapeNumero!: number;
  etapeLibelle!: string;
  cle!: string;
  libelle!: string;
  note!: string | null;
  descriptif!: string | null;
  etiquette!: string | null;
  debutJ!: number | null;
  finJ!: number | null;
  debutLe!: string | null;
  finLe!: string | null;
  @ApiProperty({ oneOf: oneOfVariants(TIME_VARIANTS), nullable: true })
  temps!: TimeDto | null;
  client!: boolean; // CLIENT · hors budget atelier
  fichiers!: boolean; // rubriques de fichiers, sans tâche
  fil!: number; // messages du fil de la carte
  @ApiProperty({ oneOf: oneOfVariants(CARD_STATE_VARIANTS) })
  etat!: CardStateDto;
  taches!: ProjectTaskDto[];
}

// Journal des personnalisations du projet (le plus récent d'abord).
export class ProjectCustomizationDto {
  id!: string;
  libelle!: string;
  par!: string | null;
  le!: string;
}

export class OpenProjectFileDto {
  id!: string;
  code!: string;
  client!: ProjectClientDto;
  cellule!: OpenProjectCellDto | null;
  equipes!: OpenProjectCellDto[];
  // La personne connectée pilote la cellule du projet (elle valide).
  jeSuisChef!: boolean;
  pilote!: string;
  version!: TemplateVersionDto | null;
  offre!: string | null;
  ouvertLe!: string | null;
  livraisonLe!: string;
  jour!: number;
  horizon!: number;
  budgetHeures!: number | null;
  dateVisiteSite!: string | null;
  statutChantier!: SiteStatus;
  factures!: TrancheStatusesDto;
  peutAssigner!: boolean;
  // Personnalisation (01/11/2026) : la direction ajoute, modifie, retire des lignes.
  peutPersonnaliser!: boolean;
  personnalisations!: ProjectCustomizationDto[];
  optionsTs!: TsOptionDto[];
  attentes!: InvoiceWaitsDto;
  etapes!: ProjectStepDto[];
  cartes!: ProjectCardDto[];
}
