import { IsOptional, IsString, MaxLength } from 'class-validator';

export class NomAfficheDto {
  // null ou vide : revenir au nom officiel.
  @IsOptional() @IsString() @MaxLength(120) nomAffiche: string | null;
}

export class PhotoDto {
  // data URI image (JPEG, PNG, WebP), déjà recadrée et allégée par le navigateur.
  @IsString() @MaxLength(600_000) image: string;
}

// Réponse de POST /auth/moi/prolongation : le jeton qui remplace le précédent.
export class SessionProlongeeDto {
  access_token: string;
}
