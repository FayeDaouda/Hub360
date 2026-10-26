import {
  BeneficiaireSoins,
  CategorieSoins,
  DecisionN1,
  MotifRefusAbsence,
  TypeAbsence,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UrlFichierJoint } from '../commun/fichier-joint';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class FichierDto {
  @IsString() @MaxLength(300) nom: string;
  @UrlFichierJoint(20_000_000) url: string;
}

export class DeposerAbsenceDto {
  @IsEnum(TypeAbsence) type: TypeAbsence;
  @Matches(DATE) dateDebut: string;
  @Matches(DATE) dateFin: string;
  @IsOptional() @IsString() @MaxLength(1000) commentaire?: string;
  @IsOptional() @ValidateNested() @Type(() => FichierDto) justificatif?: FichierDto;
  // Dir. GC : qui tient sa place pendant l'absence (autre Dir. GC ou CTO) ;
  // absent = le CTO (revue Dir. GC, 21/10/2026).
  @IsOptional() @IsUUID() suppleantId?: string;
}

export class ReponseAutresDatesDto {
  @IsBoolean() accepte: boolean;
}

class DelegationDto {
  @IsString() @MaxLength(200) livrable: string; // clé source:projetId:groupe
  @IsUUID() collaborateurId: string;
}

export class DecisionN1Dto {
  @IsEnum(DecisionN1) decision: DecisionN1;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => DelegationDto)
  delegations?: DelegationDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) nonDelegables?: string[];
  @IsOptional() @Matches(DATE) dateDebut?: string;
  @IsOptional() @Matches(DATE) dateFin?: string;
  @IsOptional() @IsEnum(MotifRefusAbsence) motif?: MotifRefusAbsence;
  @IsOptional() @IsString() @MaxLength(1000) commentaire?: string;
}

export class ValidationRhDto {
  @IsBoolean() valide: boolean;
  @IsOptional() @IsString() @MaxLength(1000) motif?: string;
}

export class DeposerRemboursementDto {
  @IsEnum(CategorieSoins) categorie: CategorieSoins;
  @IsEnum(BeneficiaireSoins) beneficiaire: BeneficiaireSoins;
  @Matches(DATE) dateSoins: string;
  @IsInt() @Min(1) @Max(100_000_000) montant: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => FichierDto)
  justificatifs?: FichierDto[];
}

export class RembourseDto {
  @IsInt() @Min(0) @Max(100_000_000) montantRembourse: number;
}

export class RejetDto {
  @IsString() @MaxLength(1000) motif: string;
}
