import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { StatutEtude } from '@prisma/client';

// PATCH …/etudes/lignes/:type — le front envoie un champ à la fois (onBlur /
// onChange). Dates au format agenda AAAA-MM-JJ, ou null pour effacer.
export class PatchLigneEtudeDto {
  @IsOptional() @IsEnum(StatutEtude) statut?: StatutEtude;
  @IsOptional() @IsString() @MaxLength(200) bet?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateRemisePrevue?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateRemiseReelle?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
