import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// PATCH …/unbord/:type — bascule « non nécessaire » et/ou coche/décoche
// manuellement l'item (sept. 2026 — un fichier joint coche aussi
// automatiquement, cf. UnbordService.joindreImages/joindreFichiers).
export class PatchLigneUnbordDto {
  @IsOptional() @IsBoolean() nonRequise?: boolean;
  @IsOptional() @IsBoolean() fait?: boolean;
}

// PATCH …/unbord/blocs/:groupe — assignation par bloc (2026-09-25), même
// motif que PatchBlocPermisDto. Pas d'échéance ici : pas demandé.
export class PatchBlocUnbordDto {
  @IsOptional() @IsString() responsableId?: string | null;
}

// -- Pièces jointes rattachées à un item — même seam que Permis/Exécution
// (ImageProjet/FichierProjet), seul `ligneUnbordId` change.

class ImageEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(12_000_000) url!: string;
}

export class JoindreImagesLigneUnbordDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ImageEntreeDto)
  fichiers!: ImageEntreeDto[];
}

class FichierEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(20_000_000) url!: string;
  @IsOptional() @IsInt() @Min(0) taille?: number;
}

export class JoindreFichiersLigneUnbordDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FichierEntreeDto)
  fichiers!: FichierEntreeDto[];
}
