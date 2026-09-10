import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Phase, TypeFichier } from '@prisma/client';

// `url` = data URI (le fichier n'est pas redimensionné — PDF / DWG). Devient
// une clé d'objet quand le stockage S3 sera branché (même seam qu'ImageProjet).
class FichierEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(20_000_000) url!: string;
  @IsOptional() @IsInt() @Min(0) taille?: number;
  @IsOptional() @IsEnum(TypeFichier) type?: TypeFichier;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
}

export class AjouterFichiersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FichierEntreeDto)
  fichiers!: FichierEntreeDto[];
}

export class PatchFichierDto {
  @IsOptional() @IsEnum(TypeFichier) type?: TypeFichier;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SupprimerFichiersDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
}
