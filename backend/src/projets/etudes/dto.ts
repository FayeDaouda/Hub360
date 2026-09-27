import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StatutEtude } from '@prisma/client';

// PATCH …/etudes/blocs/:id — le front envoie un champ à la fois (onBlur /
// onChange). Dates au format agenda AAAA-MM-JJ, ou null pour effacer.
// factureMontant/factureFichier* : appliqués UNIQUEMENT si l'appelant est
// admin/CIO (silencieusement ignorés sinon, cf. EtudesService.patchBloc) —
// jamais exposés à un collaborateur en lecture non plus (cf. formater).
export class PatchBlocEtudeDto {
  @IsOptional() @IsString() @MaxLength(200) interlocuteur?: string;
  @IsOptional() @IsString() @MaxLength(200) contactInterlocuteur?: string;
  @IsOptional() @IsEnum(StatutEtude) statut?: StatutEtude;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateRemisePrevue?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateRemiseReelle?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsInt() @Min(0) factureMontant?: number | null;
  @IsOptional() @IsString() @MaxLength(300) factureFichierNom?: string | null;
  @IsOptional() @IsString() @MaxLength(20_000_000) factureFichierCle?: string | null;
}

// PATCH …/etudes/items/:id — bascule « non nécessaire » et/ou coche/décoche
// manuellement l'item, même motif que PatchLigneUnbordDto.
export class PatchItemEtudeDto {
  @IsOptional() @IsBoolean() nonRequise?: boolean;
  @IsOptional() @IsBoolean() fait?: boolean;
}

// -- Pièces jointes rattachées à un item — même seam que Permis/Unbord
// (ImageProjet/FichierProjet), seul `itemEtudeId` change.

class ImageEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(12_000_000) url!: string;
}

export class JoindreImagesItemEtudeDto {
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

export class JoindreFichiersItemEtudeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FichierEntreeDto)
  fichiers!: FichierEntreeDto[];
}
