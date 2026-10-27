import type { SiteStatus, TrancheStatus } from './project-query';
import { LoadTargetDto, PeriodDto } from './open-projects-view.dto';

// Réponse de GET /societes/:slug/projets-ouverts/production (tableau de
// production du Dir. GC, du CTO et du CEO). TypeScript vérifie que
// ProductionService.production la respecte. Noms des champs : ceux de l'API.

export class ProductionFiguresDto {
  ouverts!: number;
  enRetard!: number; // projets avec une tâche en retard ou une livraison dépassée
  livraisons15!: number; // livraisons dans les 15 jours
  enAttente!: number; // décisions en attente, tous projets
  chargeMoyenne!: number | null; // % moyen des cellules sur deux semaines
}

export class ProductionProjectDto {
  id!: string;
  code!: string;
  client!: string;
  cellule!: string | null;
}

// Étape en cours : la plus avancée où le travail a lieu.
export class CurrentStepDto {
  numero!: number;
  libelle!: string;
  terminee!: boolean;
}

// Tâches restées ouvertes dans une étape antérieure (« en souffrance »).
export class LaggingStepDto {
  numero!: number;
  libelle!: string;
  taches!: number;
}

export class PendingDecisionsDto {
  remises!: number;
  visas!: number;
  prolongations!: number;
  ts!: number;
}

// Prochaine tranche non émise : prête (rien n'attend) ou ce qu'elle attend.
export class NextTrancheDto {
  code!: 'F2' | 'F3';
  statut!: TrancheStatus;
  attend!: string[];
}

// Carte clé dont la fenêtre se termine dans les 14 jours, pas encore close.
export class CardDeadlineDto {
  carte!: string;
  finLe!: string;
}

export class ProductionRowDto {
  projet!: ProductionProjectDto;
  statutChantier!: SiteStatus;
  etape!: CurrentStepDto | null;
  souffrance!: LaggingStepDto[];
  faites!: number;
  total!: number;
  jour!: number;
  horizon!: number;
  livraisonLe!: string;
  livraisonDepassee!: boolean;
  // Livraison dans les 15 jours, projet pas encore livré (tuile « Livraisons
  // sous 15 jours » et son filtre).
  livraisonProche!: boolean;
  enRetard!: number;
  prolongees!: number;
  attente!: PendingDecisionsDto;
  tranche!: NextTrancheDto | null;
  echeances!: CardDeadlineDto[];
}

export class MemberWorkloadDto {
  id!: string;
  nom!: string;
  heures!: number;
  disponibles!: number;
  pourcentage!: number | null;
  joursAbsence!: number;
}

export class CellWorkloadDto {
  code!: string;
  nom!: string;
  membres!: MemberWorkloadDto[];
  moyenne!: number | null;
}

// Charge des cellules sur deux semaines (même calcul que « Assigner »).
export class CellsWorkloadDto {
  periode!: PeriodDto;
  zone!: LoadTargetDto | null;
  cellules!: CellWorkloadDto[];
}

// Livraison dans les 14 jours (projet non livré).
export class UpcomingDeliveryDto {
  projetId!: string;
  code!: string;
  client!: string;
  livraisonLe!: string;
}

export class ProductionViewDto {
  perimetre!: 'mes_projets' | 'tous'; // Dir. GC : ses projets ; CTO, CEO : tous
  chiffres!: ProductionFiguresDto;
  lignes!: ProductionRowDto[];
  charge!: CellsWorkloadDto;
  livraisons!: UpcomingDeliveryDto[];
}
