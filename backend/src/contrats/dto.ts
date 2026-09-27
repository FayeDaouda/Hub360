import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// Fichier (data URI, seam S3 — même convention que FichierProjet).
export class FichierContratDto {
  @IsString() @MinLength(1) @MaxLength(300) nom!: string;
  @IsString() @MaxLength(20_000_000) url!: string;
}

// PATCH …/contrat/annexes/:id — joindre un fichier, marquer « non
// nécessaire », ou revenir à « à joindre ».
export class MajAnnexeContratDto {
  @IsIn(['a_joindre', 'jointe', 'non_necessaire']) statut!: 'a_joindre' | 'jointe' | 'non_necessaire';
  @ValidateIf((d: MajAnnexeContratDto) => d.statut === 'jointe')
  @ValidateNested()
  @Type(() => FichierContratDto)
  fichier?: FichierContratDto;
}

// POST contrats-public/:token/signature — le client signe en ligne.
export class SignerContratDto {
  @IsIn(['bouton', 'trace']) mode!: 'bouton' | 'trace';
  @IsString() @MinLength(2) @MaxLength(120) nom!: string;
  // Signature tracée : image PNG (data URI), bornée.
  @ValidateIf((d: SignerContratDto) => d.mode === 'trace')
  @Matches(/^data:image\/png;base64,/)
  @MaxLength(2_000_000)
  signatureTrace?: string;
}

// PATCH …/parametres-contrat — réglages société (societe_admin ou CIO).
export class ParametresContratDto {
  @IsOptional() @IsString() @MaxLength(100_000) modele?: string | null;
  @IsOptional() @IsString() @MaxLength(120) signataireNom?: string | null;
  @IsOptional() @IsString() @MaxLength(120) signataireFonction?: string | null;
  @IsOptional() @IsInt() @Min(0) seuilSurMesureHt?: number | null;
}

export class AnnexeGabaritDto {
  @IsString() @MinLength(1) @MaxLength(120) libelle!: string;
}
