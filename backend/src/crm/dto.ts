import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  Categorie,
  Gamme,
  NatureDossier,
  Standing,
  StatutCrm,
  TypeBien,
  TypeClient,
} from '@prisma/client';

class NouveauClientDto {
  @IsString() @MinLength(1) nom!: string;
  @IsEnum(TypeClient) type!: TypeClient;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() telephone?: string;
}

class ClientRefDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @ValidateNested() @Type(() => NouveauClientDto) nouveau?: NouveauClientDto;
}

export class CreerDossierDto {
  @IsEnum(NatureDossier) nature!: NatureDossier;
  @IsEnum(Categorie) categorie!: Categorie;
  @IsString() @MinLength(1) localisation!: string;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsEnum(TypeBien) type!: TypeBien;
  @IsInt() @Min(0) nbPlanches!: number;
  @IsInt() @Min(0) surfaceTerrain!: number;
  @IsEnum(Standing) standing!: Standing;
  @IsEnum(Gamme) gamme!: Gamme;
  @IsString() @MinLength(1) programme!: string;
  @IsEnum(StatutCrm) statut!: StatutCrm;
  @ValidateNested() @Type(() => ClientRefDto) client!: ClientRefDto;
  // Vide → généré (XX_YY.ZZ + variante V2/V3 si doublon). Renseigné → utilisé
  // tel quel, refusé (409) s'il est déjà pris pour la société.
  @IsOptional() @IsString() @MaxLength(40) code?: string;
}

export class ChangerStatutDto {
  @IsEnum(StatutCrm) statut!: StatutCrm;
}
