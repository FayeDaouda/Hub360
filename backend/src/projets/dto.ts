import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GroupeChecklistAvp, Phase } from '@prisma/client';

// Remplace l'ENSEMBLE des cellules du projet — tableau vide = désassigner
// complètement. Plusieurs équipes par projet depuis sept. 2026 (décision boss).
export class AssignerDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) celluleIds!: string[];
}

export class PoserPinDto {
  @IsOptional() @IsNumber() latitude!: number | null;
  @IsOptional() @IsNumber() longitude!: number | null;
}

// Date « agenda » AAAA-MM-JJ, ou null pour effacer (comme PatchLigneEtudeDto).
const DATE_AGENDA = /^\d{4}-\d{2}-\d{2}$/;

// Restructuration sept. 2026 : plus de section « Programme » (formulaire) ni
// de verrou « Validation » (cf. schema.prisma) — ne reste que l'affectation +
// agenda de la phase.
export class PatchAvantProjetDto {
  @IsOptional() @IsString() dessinateurId?: string | null;
  @IsOptional() @IsString() responsable3dId?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) dateDebut?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) dateFin?: string | null;
}

// PATCH …/avant-projet/checklist/:ligneId — bascule « non nécessaire »
// et/ou coche/décoche manuellement l'item, même motif que
// PatchLigneUnbordDto (sept. 2026).
export class PatchLigneChecklistAvpDto {
  @IsOptional() @IsBoolean() nonRequise?: boolean;
  @IsOptional() @IsBoolean() fait?: boolean;
}

// PATCH …/avant-projet/checklist/blocs/:groupe — assignation + échéance par
// bloc, même motif que PatchBlocPermisDto.
export class PatchBlocChecklistAvpDto {
  @IsOptional() @Matches(DATE_AGENDA) debut?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) echeance?: string | null;
  @IsOptional() @IsString() responsableId?: string | null;
}

// POST …/checklist/blocs/:groupe/prolongation — le responsable DE CE BLOC
// uniquement (vérifié en service). Motif optionnel.
export class DemanderProlongationBlocChecklistAvpDto {
  @Matches(DATE_AGENDA) echeance!: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

// PATCH …/checklist/blocs/:groupe/prolongation — admin uniquement, décide de
// la demande en attente (accepter reporte l'échéance du bloc, refuser la
// laisse telle quelle) ; dans les deux cas la demande est effacée.
export class DeciderProlongationBlocChecklistAvpDto {
  @IsBoolean() accepter!: boolean;
}

// Ajout d'un item de checklist propre à un projet — admin OU dispatcher d'une
// cellule du projet (nouveauté sept. 2026, cf. estDispatcherDuneCelluleDuProjet).
export class AjouterLigneChecklistAvpDto {
  @IsEnum(GroupeChecklistAvp) groupe!: GroupeChecklistAvp;
  @IsString() @IsNotEmpty() @MaxLength(300) libelle!: string;
}

// -- Pièces jointes rattachées à un item précis de la checklist — même seam
// que Permis/Exécution/Unbord (ImageProjet/FichierProjet), seul
// ligneChecklistAvpId change.

class ImageChecklistAvpEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(12_000_000) url!: string;
}

export class JoindreImagesLigneChecklistAvpDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ImageChecklistAvpEntreeDto)
  fichiers!: ImageChecklistAvpEntreeDto[];
}

class FichierChecklistAvpEntreeDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(20_000_000) url!: string;
  @IsOptional() @IsInt() @Min(0) taille?: number;
}

export class JoindreFichiersLigneChecklistAvpDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FichierChecklistAvpEntreeDto)
  fichiers!: FichierChecklistAvpEntreeDto[];
}

export class PatchVersionDto {
  @IsObject() couts!: Record<string, number>;
  @IsOptional() @IsNumber() @Min(0) prixVenteEstime?: number | null;
}

export class ChangerPhaseDto {
  @IsEnum(Phase) phase!: Phase;
}
