import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ACTIONS_CRM, ActionCrm } from './cycle';
import {
  Categorie,
  Gamme,
  NatureDossier,
  Standing,
  TypeApporteur,
  TypeBien,
  TypeClient,
} from '@prisma/client';

class NouveauClientDto {
  @IsString() @MinLength(1) nom!: string;
  @IsEnum(TypeClient) type!: TypeClient;
  // Obligatoire pour une personne morale (contrôlé par le service, qui connaît
  // le type) ; ignoré pour un particulier.
  @IsOptional() @IsString() @MaxLength(20) sigle?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() telephone?: string;
}

class ClientRefDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @ValidateNested() @Type(() => NouveauClientDto) nouveau?: NouveauClientDto;
  // Complète le sigle d'une personne morale existante qui n'en a pas encore.
  @IsOptional() @IsString() @MaxLength(20) sigle?: string;
}

// Pas fixes validés (sept. 2026) — mêmes valeurs que la contrainte base
// dossiers_crm_commission_apporteur_pas.
export const PAS_COMMISSION = [3, 3.5, 4, 4.5, 5] as const;

// Interne = le créateur lui-même (rempli côté serveur, rien à saisir) ;
// externe = tiers, nom obligatoire + coordonnées facultatives.
class ApporteurDto {
  @IsEnum(TypeApporteur) type!: TypeApporteur;
  @ValidateIf((a: ApporteurDto) => a.type === 'externe')
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nom?: string;
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @IsEmail() @MaxLength(120) email?: string;
}

export class CreerDossierDto {
  @IsEnum(NatureDossier) nature!: NatureDossier;
  @IsEnum(Categorie) categorie!: Categorie;
  // Localité du référentiel (liste déroulante) — le libellé `localisation`
  // du dossier en est déduit côté serveur, jamais saisi.
  @IsString() @MinLength(1) localiteId!: string;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsEnum(TypeBien) type!: TypeBien;
  @IsInt() @Min(0) nbPlanches!: number;
  @IsInt() @Min(0) surfaceTerrain!: number;
  @IsEnum(Standing) standing!: Standing;
  @IsEnum(Gamme) gamme!: Gamme;
  @IsString() @MinLength(1) programme!: string;
  @ValidateNested() @Type(() => ClientRefDto) client!: ClientRefDto;
  @ValidateNested() @Type(() => ApporteurDto) apporteur!: ApporteurDto;
  // null/absent = aucune commission. Exige finances_charges ≥ écriture.
  @IsOptional() @IsIn(PAS_COMMISSION) commissionApporteur?: number | null;
  // Obligatoire seulement s'il y a plusieurs titulaires Dir. GC (sinon choisi
  // d'office, ou « à assigner » s'il n'y en a aucun).
  @IsOptional() @IsString() proprietaireId?: string;
  // Pas de champ `code` : il est toujours généré (CLIENT_LOC.AA, -2 si
  // doublon), jamais saisi à la main (règle validée, sept. 2026).
}

// Rattachement manuel d'un dossier antérieur au référentiel (localiteId null).
export class RattacherLocaliteDto {
  @IsString() @MinLength(1) localiteId!: string;
}

export class ChangerProprietaireDto {
  @IsString() @MinLength(1) proprietaireId!: string;
}

// Action du cycle commercial (cf. crm/cycle.ts) — jamais un statut brut.
export class ActionDossierDto {
  @IsIn(ACTIONS_CRM) action!: ActionCrm;
  // Motif (perdre) ou commentaire DAF (renvoyer) — obligatoire pour ces deux
  // actions, contrôlé par le service qui connaît la règle.
  @IsOptional() @IsString() @MaxLength(1000) commentaire?: string;
}
