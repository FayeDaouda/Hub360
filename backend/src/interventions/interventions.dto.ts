import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Toute intervention de l'Administrateur HUB porte un motif, inscrit au
// journal d'audit.
export class MotifInterventionDto {
  @IsString() @MinLength(3) @MaxLength(500) motif!: string;
}

// Suppression définitive : le code à supprimer, retapé pour confirmer.
export class SuppressionDto extends MotifInterventionDto {
  @IsString() @MinLength(1) @MaxLength(60) code!: string;
}

export class CellulesProjetDto extends MotifInterventionDto {
  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) celluleIds!: string[];
}

// Réponse de GET /societes/:slug/interventions?code= : l'état du dossier et
// de son projet, ce qui peut être débloqué, et les interventions passées.
export class EtatDossierInterventionDto {
  id!: string;
  code!: string;
  statut!: string;
  client!: string;
  offreAcceptee!: boolean;
  contratSigne!: boolean;
}

export class CelluleInterventionDto {
  id!: string;
  nom!: string;
  code!: string;
}

export class EtatProjetInterventionDto {
  id!: string;
  code!: string;
  ouvertLe!: string | null;
  gabarit!: boolean;
  cellules!: CelluleInterventionDto[];
}

export class InterventionPasseeDto {
  id!: string;
  type!: string;
  detail!: string;
  motif!: string;
  par!: string | null;
  le!: Date;
}

export class EtatInterventionsDto {
  dossier!: EtatDossierInterventionDto | null;
  projet!: EtatProjetInterventionDto | null;
  cellulesDisponibles!: CelluleInterventionDto[];
  historique!: InterventionPasseeDto[];
}
