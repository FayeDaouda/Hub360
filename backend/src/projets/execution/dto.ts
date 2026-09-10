import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StatutLot, StatutReserve } from '@prisma/client';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH …/execution/lots/:type — champs d'un lot, tous confondus (admin).
export class PatchLotDto {
  @IsOptional() @IsEnum(StatutLot) statut?: StatutLot;
  @IsOptional() @IsInt() @Min(0) @Max(100) avancement?: number;
  @IsOptional() @Matches(DATE) dateDebut?: string | null;
  @IsOptional() @Matches(DATE) dateFinPrevue?: string | null;
  @IsOptional() @IsString() @MaxLength(200) entrepriseRetenue?: string;
  @IsOptional() @IsNumber() @Min(0) montantMarche?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) entreprisesConsultees?: string[];
}

// PATCH …/execution/lots/:type/suivi — seul le suivi opérationnel (statut,
// avancement, planning). Ouvert au collaborateur (matrice de droits) ; les
// champs financiers (entreprise retenue, montant, consultation) restent sur
// PatchLotDto, admin uniquement.
export class PatchLotSuiviDto {
  @IsOptional() @IsEnum(StatutLot) statut?: StatutLot;
  @IsOptional() @IsInt() @Min(0) @Max(100) avancement?: number;
  @IsOptional() @Matches(DATE) dateDebut?: string | null;
  @IsOptional() @Matches(DATE) dateFinPrevue?: string | null;
}

export class AjouterOffreDto {
  @IsString() @MinLength(1) @MaxLength(200) entreprise!: string;
  @IsNumber() @Min(0) montant!: number;
  @IsOptional() @IsInt() @Min(0) delaiJours?: number | null;
}

export class AttribuerLotDto {
  @IsString() @MinLength(1) @MaxLength(200) entreprise!: string;
  @IsNumber() @Min(0) montant!: number;
}

export class AjouterSituationDto {
  @Matches(DATE) date!: string;
  @IsInt() @Min(0) @Max(100) avancementCumule!: number;
  @IsNumber() @Min(0) montantSituation!: number;
  @IsNumber() @Min(0) retenueGarantie!: number;
  @IsNumber() montantVerse!: number;
}

export class AjouterCrDto {
  @IsString() @MinLength(1) @MaxLength(2000) texte!: string;
}

export class PatchReceptionDto {
  @IsOptional() @Matches(DATE) receptionProvisoire?: string | null;
  @IsOptional() @Matches(DATE) leveeReserves?: string | null;
  @IsOptional() @Matches(DATE) receptionDefinitive?: string | null;
  @IsOptional() @IsBoolean() validationClient?: boolean;
  @IsOptional() @Matches(DATE) dateValidationClient?: string | null;
}

export class AjouterReserveDto {
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
}

export class PatchReserveDto {
  @IsOptional() @IsEnum(StatutReserve) statut?: StatutReserve;
  @IsOptional() @Matches(DATE) dateLevee?: string | null;
}
