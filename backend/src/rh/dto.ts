import { ModePaiementSalaire, TypeContrat } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tous les champs sont facultatifs : un dossier se complète progressivement
// (le taux de complétude le dit). null efface une date / le salaire.
export class DossierPersonnelDto {
  @IsOptional() @IsUUID() societeId?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() collaborateurId?: string | null;
  // Compte HUB d'un salarié sans fiche d'équipe (exclusif avec collaborateurId).
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() utilisateurId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) poste?: string;
  @IsOptional() @IsEnum(TypeContrat) typeContrat?: TypeContrat;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) dateEntree?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) dateFin?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: 'Le salaire doit être un montant entier en FCFA.' })
  @Min(0)
  @Max(100_000_000, { message: 'Montant anormalement élevé — vérifiez la saisie.' })
  salaireBase?: number | null;
  @IsOptional() @IsString() @MaxLength(80) prenom?: string;
  @IsOptional() @IsString() @MaxLength(80) nom?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) dateNaissance?: string | null;
  @IsOptional() @IsString() @MaxLength(120) lieuNaissance?: string;
  @IsOptional() @IsString() @MaxLength(80) nationalite?: string;
  @IsOptional() @IsString() @MaxLength(40) numeroPiece?: string;
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @IsString() @MaxLength(160) emailPro?: string;
  @IsOptional() @IsString() @MaxLength(200) contactUrgence?: string;
  @IsOptional() @IsEnum(ModePaiementSalaire) modePaiement?: ModePaiementSalaire;
  @IsOptional() @IsString() @MaxLength(80) coordonneesPaiement?: string;
  @IsOptional() @IsString() @MaxLength(60) numeroIpm?: string;
  @IsOptional() @IsString() @MaxLength(2000) missionResultat?: string;
  @IsOptional() @IsString() @MaxLength(2000) missionLivrables?: string;
  @IsOptional() @IsString() @MaxLength(2000) missionKpi?: string;
  @IsOptional() @IsString() @MaxLength(2000) missionSignalAlerte?: string;
}

export class ReaffectationDto {
  @IsUUID() tacheId: string;
  @IsUUID() collaborateurId: string;
}

export class ArchivageDto {
  @IsBoolean() archive: boolean;
  // Départ : nouveau titulaire de chaque tâche de projet encore ouverte.
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReaffectationDto)
  reaffectations?: ReaffectationDto[];
}

// Changement de moyen de paiement demandé par le salarié : la RH valide
// (appliqué à la paie) ou refuse.
export class DecisionPaiementDto {
  @IsBoolean() valide: boolean;
}

export class PieceDto {
  @IsString() @MaxLength(300) nom: string;
  @IsString() @MaxLength(20_000_000) url: string; // data URI
}
