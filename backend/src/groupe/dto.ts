import { IsBoolean, IsEmail, IsOptional, IsUUID } from 'class-validator';

export class ChangerRoleDto {
  @IsUUID() roleId: string;
}

// Création d'un compte depuis un dossier RH (phase 1, 14/10/2026) : le dossier
// porte l'identité. Pas de cellule ici (revue Dir. GC, 21/10/2026) : le Dir.
// GC organise les cellules et affecte le nouvel arrivant.
export class CreerCompteDto {
  @IsUUID() dossierId: string;
  @IsEmail({}, { message: 'Adresse e-mail invalide.' }) email: string;
  @IsUUID() roleId: string;
}

export class ChangerActifDto {
  @IsBoolean() actif: boolean;
}
