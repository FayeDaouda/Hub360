import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class ParametreDto {
  @IsIn(['heures_annuelles', 'coefficient_charges', 'marge_cible']) cle!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber() valeur!: number | null;
  @Matches(/^\d{4}-\d{2}-01$/, { message: 'La date d’effet est le 1er d’un mois.' }) dateEffet!: string;
  @IsString() @MinLength(3, { message: 'Le motif est obligatoire.' }) @MaxLength(300) motif!: string;
}
