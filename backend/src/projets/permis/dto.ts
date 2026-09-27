import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GroupeChecklistPermis, StatutPermis } from '@prisma/client';

// PATCH …/permis — le front renvoie tout l'objet permis moins `projetId`.
// Tous les champs sont optionnels ; `dossier` est le sous-objet à 5 clés
// (snake_case côté front) éclaté en colonnes par le service. Réservé au
// responsable du bloc « dossier_permis » + admin (vérifié en service) — ce
// bloc recouvre le même dossier administratif que ces champs historiques.
// `statut` réduit à 3 valeurs utilisables (a_deposer = « en cours », obtenu,
// refuse) depuis le retrait du workflow de dépôt/instruction intermédiaire.
export class PatchPermisDto {
  @IsOptional() @IsObject() dossier?: Record<string, boolean>;
  @IsOptional() @IsEnum(StatutPermis) statut?: StatutPermis;
  @IsOptional() @IsDateString() dateObtention?: string | null;
  @IsOptional() @IsDateString() dateRefus?: string | null;
}

// -- Sous-checklist opérationnelle du permis — mêmes DTO que
// LigneChecklistAvp (cf. src/projets/dto.ts), portés ici pour rester dans le
// module Permis plutôt que le module Projets générique. --

const DATE_AGENDA = /^\d{4}-\d{2}-\d{2}$/;

export class PatchLigneChecklistPermisDto {
  @IsOptional() @IsBoolean() fait?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsBoolean() nonRequise?: boolean;
}

// -- Blocs (Dossier de permis / Dépôt urbanisme / Procédure) ---------------
// Échéance + responsable vivent au niveau du bloc, pas de l'item ni du
// module entier (décision boss, sept. 2026, cf. mémoire) : chaque bloc peut
// avoir une personne différente et une échéance propre.

// PATCH …/permis/blocs/:groupe — admin uniquement.
export class PatchBlocPermisDto {
  @IsOptional() @Matches(DATE_AGENDA) echeance?: string | null;
  @IsOptional() @IsString() responsableId?: string | null;
}

// POST …/permis/blocs/:groupe/prolongation — le responsable DE CE BLOC
// uniquement (vérifié en service). Motif optionnel.
export class DemanderProlongationBlocDto {
  @Matches(DATE_AGENDA) echeance!: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

// PATCH …/permis/blocs/:groupe/prolongation — admin uniquement, décide de la
// demande en attente (accepter reporte l'échéance du bloc, refuser la laisse
// telle quelle) ; dans les deux cas la demande est effacée.
export class DeciderProlongationBlocDto {
  @IsBoolean() accepter!: boolean;
}

// Ajout d'un item de checklist propre à un projet — admin uniquement.
export class AjouterLigneChecklistPermisDto {
  @IsEnum(GroupeChecklistPermis) groupe!: GroupeChecklistPermis;
  @IsString() @IsNotEmpty() @MaxLength(300) libelle!: string;
}

// -- Pièces jointes rattachées à un item précis de la checklist -------------
// Même seam de stockage que les modules Images/Documents (data URI en
// transition) : le fichier vit dans ImageProjet/FichierProjet comme un
// upload normal, seul `ligneChecklistPermisId` + `phase: 'permis'` (posés
// côté service) le rattachent à cette ligne — un objet, deux points d'accès.

class ImageEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(12_000_000) url!: string;
}

export class JoindreImagesLigneDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ImageEntreeDto)
  fichiers!: ImageEntreeDto[];
}

class FichierEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(20_000_000) url!: string;
  @IsOptional() @IsInt() @Min(0) taille?: number;
}

export class JoindreFichiersLigneDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FichierEntreeDto)
  fichiers!: FichierEntreeDto[];
}
