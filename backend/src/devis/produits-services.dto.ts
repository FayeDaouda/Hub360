import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// Catalogue optionnel (cf. cadrage « Devis ») — démarre vide, l'admin
// l'alimente au fil de l'eau. `prixUnitaire` nullable : certains prix varient
// trop d'un projet à l'autre pour être fixés au catalogue.
export class CreerProduitServiceDto {
  @IsString() @MinLength(1) @MaxLength(200) designation!: string;
  @IsOptional() @IsNumber() @Min(0) prixUnitaire?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class PatchProduitServiceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) designation?: string;
  @IsOptional() @IsNumber() @Min(0) prixUnitaire?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tauxTva?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
