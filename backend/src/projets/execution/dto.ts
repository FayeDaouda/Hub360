import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GroupeChecklistExecution } from '@prisma/client';

// -- Sous-checklist opérationnelle de l'exécution — mêmes DTO que
// LigneChecklistPermis (cf. src/projets/permis/dto.ts), portés ici pour
// rester dans le module Exécution. --

const DATE_AGENDA = /^\d{4}-\d{2}-\d{2}$/;

export class PatchLigneChecklistExecutionDto {
  @IsOptional() @IsBoolean() fait?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsBoolean() nonRequise?: boolean;
}

// -- Blocs (Études / Les Plans / Viabilité / Locaux techniques / Aménagements
// / Cahiers de menuiserie / Détails / CCTP) ---------------------------------
// Échéance + responsable vivent au niveau du bloc, pas de l'item ni du
// module entier — même motif que Permis (décision boss, sept. 2026, cf.
// mémoire) : chaque bloc peut avoir une personne différente et une échéance
// propre.

// PATCH …/execution/blocs/:groupe — admin uniquement.
export class PatchBlocExecutionDto {
  @IsOptional() @Matches(DATE_AGENDA) debut?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) echeance?: string | null;
  @IsOptional() @IsString() responsableId?: string | null;
}

// POST …/execution/blocs/:groupe/prolongation — le responsable DE CE BLOC
// uniquement (vérifié en service). Motif optionnel.
export class DemanderProlongationBlocExecutionDto {
  @Matches(DATE_AGENDA) echeance!: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

// PATCH …/execution/blocs/:groupe/prolongation — admin uniquement, décide de
// la demande en attente (accepter reporte l'échéance du bloc, refuser la
// laisse telle quelle) ; dans les deux cas la demande est effacée.
export class DeciderProlongationBlocExecutionDto {
  @IsBoolean() accepter!: boolean;
}

// Ajout d'un item de checklist propre à un projet — admin uniquement.
export class AjouterLigneChecklistExecutionDto {
  @IsEnum(GroupeChecklistExecution) groupe!: GroupeChecklistExecution;
  @IsString() @IsNotEmpty() @MaxLength(300) libelle!: string;
}

// -- Pièces jointes rattachées à un item précis de la checklist -------------
// Même seam de stockage que Permis (data URI en transition) : le fichier vit
// dans ImageProjet/FichierProjet comme un upload normal, seul
// `ligneChecklistExecutionId` + `phase: 'chantier'` (posés côté service) le
// rattachent à cette ligne — un objet, deux points d'accès.

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
