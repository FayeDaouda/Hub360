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
import { Phase, UsageImage } from '@prisma/client';

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
}

export class PatchImageDto {
  @IsOptional() @IsEnum(UsageImage) usage?: UsageImage;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
  @IsOptional() @IsString() @MaxLength(500) legende?: string;
}

class LotPatchDto {
  @IsOptional() @IsEnum(UsageImage) usage?: UsageImage;
  @IsOptional() @IsEnum(Phase) phase?: Phase | null;
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
