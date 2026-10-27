import { Type } from 'class-transformer';
import {
  IsArray,
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

export class MotifDto {
  @IsString() @MinLength(3, { message: 'Motif obligatoire.' }) @MaxLength(500) motif: string;
}

export class GabaritDto extends MotifDto {
  @IsInt() depuis: number; // version éditée (contrôle de concurrence)
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChangementDto) changements: ChangementDto[];
}

export class ValeursDto extends MotifDto {
  @IsObject() valeurs: Record<string, unknown>;
}
