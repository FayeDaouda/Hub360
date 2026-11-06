import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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
}
