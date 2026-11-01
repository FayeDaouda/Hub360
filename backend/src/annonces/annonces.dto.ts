import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Nouvelle annonce (lot 12, 01/11/2026).
export class CreerAnnonceDto {
  @IsString() @MinLength(3) @MaxLength(160) titre!: string;
  @IsString() @MinLength(3) @MaxLength(5000) contenu!: string;
  @IsIn(['societe', 'groupe', 'equipe']) audience!: 'societe' | 'groupe' | 'equipe';
  @ValidateIf((d: CreerAnnonceDto) => d.audience === 'equipe') @IsUUID() celluleId?: string;
  @IsOptional() @IsBoolean() importante?: boolean;
}

export class AnnonceDto {
  id: string;
  titre: string;
  contenu: string;
  audience: 'societe' | 'groupe' | 'equipe';
  destinataires: string; // « Grey Concrete », « Tout le groupe », « Équipe Architecture »
  importante: boolean;
  statut: 'a_valider' | 'publiee' | 'retiree';
  auteur: string;
  societe: string;
  publieeLe: string | null;
  // Annonce importante : l'avez-vous lue ? Combien l'ont lue (auteur, validateurs).
  lue: boolean;
  lectures: number | null;
  peutRetirer: boolean;
}

export class VueAnnoncesDto {
  annonces: AnnonceDto[];
  aValider: AnnonceDto[];
  peutRediger: boolean;
  publieDirectement: boolean;
  equipes: { id: string; nom: string }[];
}
