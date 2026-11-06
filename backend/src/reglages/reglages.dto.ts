import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChangementDto {
  @IsString() @MaxLength(80) carte: string;
  @IsOptional() @IsString() @MaxLength(80) tache?: string;
  @IsIn(['debut', 'fin', 'heures', 'visa', 'fichier']) champ: 'debut' | 'fin' | 'heures' | 'visa' | 'fichier';
  @IsNumber() valeur: number;
}

// Ligne (tâche) ajoutée en fin de carte, ou retirée (01/11/2026).
export class AjoutLigneDto {
  @IsString() @MaxLength(80) carte: string;
  @IsString() @MinLength(2) @MaxLength(160) libelle: string;
  @IsOptional() @IsInt() debut?: number;
  @IsOptional() @IsInt() fin?: number;
  // Absent ou null : sans temps atelier.
  @IsOptional() @IsNumber() heures?: number | null;
  @IsOptional() @IsBoolean() visaDplg?: boolean;
  @IsOptional() @IsBoolean() fichierObligatoire?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) descriptif?: string;
}

export class RetraitLigneDto {
  @IsString() @MaxLength(80) carte: string;
  @IsString() @MaxLength(80) tache: string;
}

export class MotifDto {
  @IsString() @MinLength(3, { message: 'Motif obligatoire.' }) @MaxLength(500) motif: string;
}

export class GabaritDto extends MotifDto {
  @IsInt() depuis: number; // version éditée (contrôle de concurrence)
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChangementDto) changements: ChangementDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AjoutLigneDto)
  ajouts?: AjoutLigneDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RetraitLigneDto)
  retraits?: RetraitLigneDto[];
}

export class ValeursDto extends MotifDto {
  @IsObject() valeurs: Record<string, unknown>;
}
