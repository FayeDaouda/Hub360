import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Décision du valideur sur une remise (POST …/taches/:projetId/:tacheId/decision).
export class TaskDecisionDto {
  @IsIn(['valider', 'renvoyer']) decision: 'valider' | 'renvoyer';
  // Renvoi en reprise : motif obligatoire (mêmes règles que la page Projets).
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}
