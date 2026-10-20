import { IsBoolean, IsEmail, IsOptional, IsUUID } from 'class-validator';

export class ChangerRoleDto {
  @IsUUID() roleId: string;
}

// Création d'un compte depuis un dossier RH (phase 1, 14/10/2026) : le dossier
// porte l'identité ; la cellule est facultative (sans cellule, pas de fiche
// d'équipe : comptes de direction).
export class CreerCompteDto {
  @IsUUID() dossierId: string;
  @IsEmail({}, { message: 'Adresse e-mail invalide.' }) email: string;
  @IsUUID() roleId: string;
  @IsOptional() @IsUUID() celluleId?: string;
}

export class ChangerActifDto {
  @IsBoolean() actif: boolean;
}
