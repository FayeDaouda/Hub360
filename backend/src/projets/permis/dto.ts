import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StatutNicad, StatutPermis, VoieDepot } from '@prisma/client';

// PATCH …/permis — le front renvoie tout l'objet permis moins `projetId` et
// `journal`. Tous les champs sont optionnels ; `dossier` est le sous-objet à
// 5 clés (snake_case côté front) éclaté en colonnes par le service.
export class PatchPermisDto {
  @IsOptional() @IsEnum(StatutNicad) nicad?: StatutNicad;
  @IsOptional() @IsString() nicadNumero?: string;
  @IsOptional() @IsBoolean() planBornage?: boolean;
  @IsOptional() @IsObject() dossier?: Record<string, boolean>;
  @IsOptional() @IsEnum(StatutPermis) statut?: StatutPermis;
  @IsOptional() @IsEnum(VoieDepot) voie?: VoieDepot | null;
  @IsOptional() @IsDateString() dateDepot?: string | null;
  @IsOptional() @IsString() numeroRecepisse?: string;
  @IsOptional() @IsDateString() dateObtention?: string | null;
  @IsOptional() @IsDateString() dateRefus?: string | null;
  @IsOptional() @IsBoolean() certificatConformite?: boolean;
  @IsOptional() @IsDateString() dateCertificat?: string | null;
}

export class AjouterEntreeJournalDto {
  @IsString() @MinLength(1) @MaxLength(2000) texte!: string;
}
