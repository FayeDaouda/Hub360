import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ROLES_ENDOSSABLES } from '@hub/domain';

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

// POST /auth/moi/role : rôle endossé par l'Administrateur HUB.
export class EndosserRoleDto {
  @IsIn(ROLES_ENDOSSABLES) role: string;
}

// Réponse : le jeton du rôle endossé, qui remplace le précédent.
export class RoleEndosseDto {
  access_token: string;
  role: string;
  permissions: Record<string, string>;
}
