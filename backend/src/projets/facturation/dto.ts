import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ModePaiement } from '@prisma/client';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST …/factures — une facture unique (mode « facture unique »). Le `type`
// n'est pas dans le body : il découle de la nature du projet (cadrage §2). Le
// `jalon` non plus : une facture d'échéancier passe par POST …/factures/echeancier.
export class CreerFactureDto {
  @IsOptional() @IsNumber() @Min(0) montantHt?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
  @IsOptional() @Matches(DATE) echeanceLe?: string | null;
  @IsOptional() @IsString() @MaxLength(200) libelle?: string;
}

// PATCH …/factures/:id — modification d'un BROUILLON uniquement (409 sinon,
// cadrage §5 : une facture émise se corrige par un avoir).
export class PatchFactureDto {
  @IsOptional() @IsNumber() @Min(0) montantHt?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
  @IsOptional() @Matches(DATE) echeanceLe?: string | null;
  @IsOptional() @IsString() @MaxLength(200) libelle?: string;
}

class MontantsJalonsDto {
  @IsNumber() @Min(0) signature!: number;
  @IsNumber() @Min(0) avant_projet!: number;
  @IsNumber() @Min(0) livraison!: number;
}

class EcheancesJalonsDto {
  @IsOptional() @Matches(DATE) signature?: string;
  @IsOptional() @Matches(DATE) avant_projet?: string;
  @IsOptional() @Matches(DATE) livraison?: string;
}

// POST …/factures/echeancier — crée les 3 factures brouillon de l'échéancier
// standard (mandat client). Chaque facture est ensuite émise individuellement
// quand le projet atteint le jalon. Répartition = montant HT explicite par
// jalon (cadrage §10 : saisie manuelle par jalon).
export class CreerEcheancierDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
  @IsObject() @ValidateNested() @Type(() => MontantsJalonsDto)
  montants!: MontantsJalonsDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => EcheancesJalonsDto)
  echeances?: EcheancesJalonsDto;
}

// POST …/factures/:id/paiements — un versement reçu sur une facture émise.
export class AjouterPaiementDto {
  @Matches(DATE) date!: string;
  @IsNumber() @Min(1) montant!: number;
  @IsOptional() @IsEnum(ModePaiement) mode?: ModePaiement;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

// POST …/factures/mensualites — facture de la mensualité du mois d'une ligne
// SU / EX de l'offre acceptée (étape H2, facturation mensuelle manuelle).
export class CreerMensualiteDto {
  @IsString() ligneDevisId!: string;
}

// POST …/factures/refacturation-etudes — une facture, une ligne par étude
// (étape H3, CGV art. 5).
export class RefacturerEtudesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blocIds!: string[];
}

// Facture directe d'un lead (sans offre) — maquette Finances, oct. 2026 :
// « pour une prestation facturée directement depuis le lead, par exemple un
// diagnostic CO0 au forfait ». Lignes libres (désignation + montant HT).
export class LigneFactureDirecteDto {
  @IsString() @MaxLength(200) designation!: string;
  @IsNumber() @Min(1) @Max(100_000_000_000) montantHt!: number;
}

export class CreerFactureDirecteDto {
  @IsString() dossierCrmId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LigneFactureDirecteDto)
  lignes!: LigneFactureDirecteDto[];
}
