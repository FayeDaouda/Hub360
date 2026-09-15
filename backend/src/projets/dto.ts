import { Type } from 'class-transformer';
import {
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
  ValidateNested,
} from 'class-validator';
import { GroupeChecklistAvp, NiveauFinition, Phase } from '@prisma/client';

export class AssignerDto {
  @IsOptional() @IsString() celluleId!: string | null;
}

export class PoserPinDto {
  @IsOptional() @IsNumber() latitude!: number | null;
  @IsOptional() @IsNumber() longitude!: number | null;
}

// Checklist imbriquée, alignée sur frontend/lib/types.ts::ChecklistAvantProjet.
// Le service l'aplati en colonnes.
class ChecklistDto {
  @IsOptional() @IsBoolean() programmeValide?: boolean;
  @IsOptional() @IsBoolean() budgetValide?: boolean;
  @IsOptional() @IsBoolean() esquisseValidee?: boolean;
  @IsOptional() @IsBoolean() engagementValide?: boolean;
}

// Date « agenda » AAAA-MM-JJ, ou null pour effacer (comme PatchLigneEtudeDto).
const DATE_AGENDA = /^\d{4}-\d{2}-\d{2}$/;

export class PatchAvantProjetDto {
  @IsOptional() @IsInt() @Min(0) besoinSurface?: number | null;
  @IsOptional() @IsInt() @Min(0) nbLots?: number | null;
  @IsOptional() @IsString() usages?: string;
  @IsOptional() @IsEnum(NiveauFinition) niveauFinition?: NiveauFinition;
  @IsOptional() @IsNumber() @Min(0) budgetCibleClient?: number | null;
  @IsOptional() @IsString() delaiSouhaite?: string;
  @IsOptional() @IsString() contraintes?: string;
  @IsOptional() @IsString() references?: string;
  @IsOptional() @IsString() dessinateurId?: string | null;
  @IsOptional() @IsString() responsable3dId?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) dateDebut?: string | null;
  @IsOptional() @Matches(DATE_AGENDA) dateFin?: string | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ChecklistDto)
  checklist?: ChecklistDto;
  @IsOptional() @IsString() pieceValidation?: string | null;
}

// PATCH …/avant-projet/checklist/:cle — un champ à la fois (calqué sur
// PatchLigneEtudeDto). La clé est validée en param via ParseEnumPipe.
export class PatchLigneChecklistAvpDto {
  @IsOptional() @IsBoolean() fait?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

// Ajout d'un item de checklist propre à un projet — admin uniquement.
export class AjouterLigneChecklistAvpDto {
  @IsEnum(GroupeChecklistAvp) groupe!: GroupeChecklistAvp;
  @IsString() @IsNotEmpty() @MaxLength(300) libelle!: string;
}

export class PatchVersionDto {
  @IsObject() couts!: Record<string, number>;
  @IsOptional() @IsNumber() @Min(0) prixVenteEstime?: number | null;
}

export class ChangerPhaseDto {
  @IsEnum(Phase) phase!: Phase;
}
