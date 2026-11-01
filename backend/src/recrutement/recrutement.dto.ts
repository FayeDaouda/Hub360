import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UrlFichierJoint } from '../commun/fichier-joint';

// Recrutement (lot 13, 01/11/2026).
export class DemandePosteDto {
  @IsString() @MinLength(2) @MaxLength(160) intitule!: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsUUID() celluleId?: string;
}

export class DecisionPosteDto {
  @IsBoolean() accepter!: boolean;
  @ValidateIf((d: DecisionPosteDto) => !d.accepter) @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

export class NouveauCandidatDto {
  @IsString() @MinLength(1) @MaxLength(80) prenom!: string;
  @IsString() @MinLength(1) @MaxLength(80) nom!: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}

export class NoteCandidatDto {
  @IsString() @MinLength(2) @MaxLength(3000) note!: string;
  // true : la note accompagne le passage en entretien.
  @IsOptional() @IsBoolean() entretien?: boolean;
}

export class DecisionEmbaucheDto {
  @IsBoolean() embaucher!: boolean;
  // Envoie la réponse finale au candidat (appel à candidatures, 01/11/2026).
  @IsOptional() @IsBoolean() prevenirCandidat?: boolean;
  @ValidateIf((d: DecisionEmbaucheDto) => d.embaucher) @Matches(/^\d{4}-\d{2}-\d{2}$/) dateEntree?: string;
  @ValidateIf((d: DecisionEmbaucheDto) => !d.embaucher) @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

// Embauche directe (01/11/2026) : sans poste ni candidature à trier.
export class EmbaucheDirecteDto {
  @IsString() @MinLength(1) @MaxLength(80) prenom!: string;
  @IsString() @MinLength(1) @MaxLength(80) nom!: string;
  @IsString() @MinLength(2) @MaxLength(160) intitule!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dateEntree!: string;
  @IsOptional() @IsUUID() celluleId?: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
}

// Entretien : un rendez-vous de l'Agenda (le demandeur du poste est invité d'office).
export class EntretienDto {
  @IsDateString() debut!: string;
  @IsDateString() fin!: string;
  @IsOptional() @IsString() @MaxLength(200) lieu?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) inviteIds?: string[];
  // Envoie la convocation au candidat par e-mail.
  @IsOptional() @IsBoolean() prevenirCandidat?: boolean;
}

// Appel à candidatures (01/11/2026).
export const CLES_PIECES = ['cv', 'lettre', 'diplomes', 'portfolio', 'references', 'autre'] as const;
export type ClePiece = (typeof CLES_PIECES)[number];

export class PieceDemandeeDto {
  @IsIn(CLES_PIECES) cle!: ClePiece;
  // « autre » : le nom de la pièce, choisi par la RH.
  @IsOptional() @IsString() @MaxLength(80) libelle?: string;
  @IsBoolean() obligatoire!: boolean;
}

export class QuestionAppelDto {
  @IsOptional() @IsString() @MaxLength(40) id?: string;
  @IsString() @MinLength(3) @MaxLength(300) libelle!: string;
  @IsBoolean() obligatoire!: boolean;
}

export class AppelDto {
  @IsString() @MinLength(20) @MaxLength(8000) presentation!: string;
  @IsOptional() @IsString() @MaxLength(120) lieu?: string;
  @IsOptional() @IsString() @MaxLength(60) typeContrat?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateLimite?: string;
  @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => PieceDemandeeDto) pieces!: PieceDemandeeDto[];
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => QuestionAppelDto)
  questions!: QuestionAppelDto[];
}

export class EtatAppelDto {
  @IsBoolean() ouvert!: boolean;
}

// Dépôt public d'une candidature (sans compte).
export class PieceDeposeeDto {
  @IsIn(CLES_PIECES) cle!: ClePiece;
  @IsString() @MinLength(1) @MaxLength(200) nom!: string;
  // 8 Mo réels au plus (le data URI base64 gonfle d'un tiers).
  @UrlFichierJoint(11_200_000, 'candidature') url!: string;
}

export class CandidaterDto {
  @IsString() @MinLength(1) @MaxLength(80) prenom!: string;
  @IsString() @MinLength(1) @MaxLength(80) nom!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(6) @MaxLength(40) telephone!: string;
  @IsOptional() @IsObject() reponses?: Record<string, string>;
  @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => PieceDeposeeDto) pieces!: PieceDeposeeDto[];
  @Equals(true, { message: 'Le consentement est nécessaire pour envoyer votre candidature.' }) consentement!: boolean;
  // Piège à robots : champ caché, toujours vide pour un humain.
  @IsOptional() @IsString() @MaxLength(200) siteWeb?: string;
}
