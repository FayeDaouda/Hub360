import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Phase, TypePhotoImage, UsageImage } from '@prisma/client';

// `url` = data URI (le client redimensionne avant l'envoi). Devient une clé
// d'objet quand le stockage S3 sera branché — cf. artifact §08, choix 4.
class FichierDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(12_000_000) url!: string;
}

export class AjouterImagesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FichierDto)
  fichiers!: FichierDto[];

  // Choisi une fois pour tout le lot au moment de l'ajout — évite de rouvrir
  // chaque image ensuite pour la tagger (cf. échange du 2026-09-17). Le
  // client bloque déjà l'envoi tant que ce n'est pas choisi (AjoutImagesModal)
  // — rendu obligatoire ici aussi (sept. 2026) pour fermer l'écart entre les
  // deux : voir MODULE_TYPE_PHOTO dans images.service.ts pour l'équivalent
  // côté « joindre » depuis les autres checklists.
  @IsEnum(TypePhotoImage) typePhoto!: TypePhotoImage;
}

export class PatchImageDto {
  @IsOptional() @IsEnum(UsageImage) usage?: UsageImage;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
  @IsOptional() @IsEnum(TypePhotoImage) typePhoto?: TypePhotoImage | null;
  @IsOptional() @IsString() @MaxLength(500) legende?: string;
}

class LotPatchDto {
  @IsOptional() @IsEnum(UsageImage) usage?: UsageImage;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
  @IsOptional() @IsEnum(TypePhotoImage) typePhoto?: TypePhotoImage | null;
}

export class PatchImagesEnLotDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
  @IsObject() @ValidateNested() @Type(() => LotPatchDto) patch!: LotPatchDto;
}

export class ReordonnerImagesDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

export class SupprimerImagesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
}
