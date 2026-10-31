import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Les quatre droits d'un rôle sur une étape (matrice, 31/10/2026).
export class DroitsEtapeDto {
  @IsBoolean() lecture!: boolean;
  @IsBoolean() ecriture!: boolean;
  @IsBoolean() validation!: boolean;
  @IsBoolean() suppression!: boolean;
}

export class ChangementDroitsDto {
  @IsUUID() roleId!: string;
  @IsString() @MaxLength(80) etapeCle!: string;
  @ValidateNested() @Type(() => DroitsEtapeDto) droits!: DroitsEtapeDto;
}

// « Enregistrer » de l'écran Droits : toutes les cases changées d'un coup,
// pour que chaque titulaire reçoive un seul avis.
export class EnregistrerDroitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChangementDroitsDto)
  changements!: ChangementDroitsDto[];
}
