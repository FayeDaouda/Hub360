import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { INSTANCES_SAISIE } from './pilotage-regles';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Décision d'une instance saisie au registre (manuel §4.1) : responsable =
// un rôle de direction OU un collaborateur de la société.
export class SaisirDecisionDto {
  @IsIn(INSTANCES_SAISIE) instance!: (typeof INSTANCES_SAISIE)[number];
  @IsString() @MinLength(3) @MaxLength(500) texte!: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @IsString() responsableRole?: string;
  @IsOptional() @IsString() responsableCollaborateurId?: string;
  @Matches(DATE) echeance!: string; // §4.1 : chaque décision a une échéance
}

// Dépôt d'un reporting : l'analyse de l'émetteur est obligatoire.
export class DeposerReportingDto {
  @IsString() @MinLength(10) @MaxLength(4000) analyse!: string;
}
