import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class DecisionTacheDto {
  @IsIn(['valider', 'renvoyer']) decision: 'valider' | 'renvoyer';
  // Renvoi en reprise : motif obligatoire (mêmes règles que la page Projets).
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}
