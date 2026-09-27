import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class LigneDevisDto {
  // Piocher dans le catalogue reste une option à côté de la ligne libre —
  // jamais une contrainte (cf. cadrage « Devis »).
  @IsOptional() @IsString() produitServiceId?: string;
  @IsString() @MinLength(1) @MaxLength(200) designation!: string;
  @IsNumber() @Min(0.01) quantite!: number;
  // Ligne CO (tarif × surface × planches) — la quantité est alors recalculée
  // par le serveur ; planches imposées par le dossier pour une offre CRM.
  @IsOptional() @IsInt() @Min(1) surfaceM2?: number;
  @IsOptional() @IsInt() @Min(1) planches?: number;
  @IsNumber() @Min(0) prixUnitaire!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
}

// POST …/devis — un devis naît toujours en brouillon, sans numéro (attribué à
// l'envoi, comme Facture.numero).
export class CreerDevisDto {
  @IsString() clientId!: string;
  @IsOptional() @IsString() projetId?: string; // nullable — devis « libre »
  // Offre d'un dossier CRM (étape F) — préparée en « Nouveau projet »,
  // envoyée par la validation DAF uniquement ; validité fixée à l'envoi.
  @IsOptional() @IsString() dossierCrmId?: string;
  @IsOptional() @IsString() @MaxLength(200) objet?: string;
  @IsOptional() @Matches(DATE) dateValidite?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneDevisDto)
  lignes!: LigneDevisDto[];
}

// PATCH …/devis/:id — modification d'un BROUILLON uniquement (409 sinon, même
// invariant que Facture) ; remplace intégralement les lignes fournies.
export class PatchDevisDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() projetId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) objet?: string;
  @IsOptional() @Matches(DATE) dateValidite?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneDevisDto)
  lignes?: LigneDevisDto[];
}

// POST …/devis/:id/reponse — validation MANUELLE par l'admin (le client a
// répondu par un autre canal). Le lien public à usage unique (cf. module à
// venir) offre le second canal, sans authentification.
export class ReponseDevisDto {
  @IsIn(['accepte', 'refuse']) reponse!: 'accepte' | 'refuse';
}
