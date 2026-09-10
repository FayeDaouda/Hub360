import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NiveauCollaborateur } from '@prisma/client';

// Date « agenda » AAAA-MM-JJ (même convention que les dates d'avant-projet /
// d'exécution). `null` = effacer la valeur.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreerCelluleDto {
  @IsString() @MinLength(1) @MaxLength(120) nom!: string;
}

export class MajCelluleDto {
  @IsString() @MinLength(1) @MaxLength(120) nom!: string;
}

// `photo` = data URI (redimensionnée client-side), stockée telle quelle dans
// photoCle en transition — seam S3 identique à ImageProjet.
export class CreerCollaborateurDto {
  @IsString() @MinLength(1) @MaxLength(120) prenom!: string;
  @IsString() @MinLength(1) @MaxLength(120) nom!: string;
  @IsString() @MinLength(1) @MaxLength(120) role!: string;
  @IsEnum(NiveauCollaborateur) niveau!: NiveauCollaborateur;
  @IsOptional() @IsString() celluleId?: string | null;
  @IsOptional() @IsString() @MaxLength(12_000_000) photo?: string | null;
  @IsOptional() @Matches(DATE) dateArrivee?: string | null;
}

export class MajCollaborateurDto {
  @IsOptional() @IsString() @MaxLength(120) prenom?: string;
  @IsOptional() @IsString() @MaxLength(120) nom?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsEnum(NiveauCollaborateur) niveau?: NiveauCollaborateur;
  @IsOptional() @IsString() celluleId?: string | null; // null = retiré de toute cellule
  @IsOptional() @IsString() @MaxLength(12_000_000) photo?: string | null;
  @IsOptional() @Matches(DATE) dateArrivee?: string | null; // null = effacer
  // Couper / rétablir l'accès du compte lié (kill switch = Utilisateur.actif).
  @IsOptional() @IsBoolean() actif?: boolean;
}

export class InviterCollaborateurDto {
  @IsEmail() email!: string;
}
