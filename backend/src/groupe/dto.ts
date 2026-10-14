import { IsBoolean, IsEmail, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class ChangerRoleDto {
  @IsUUID() roleId: string;
}

// null = retirer le salaire (redevient « non renseigné »). Plafond : garde-fou
// contre une faute de frappe (un zéro de trop), pas une règle métier.
export const SALAIRE_MAX_FCFA = 100_000_000;

export class DefinirSalaireDto {
  @ValidateIf((_, valeur) => valeur !== null)
  @IsInt({ message: 'Le salaire doit être un montant entier en FCFA.' })
  @Min(0, { message: 'Le salaire ne peut pas être négatif.' })
  @Max(SALAIRE_MAX_FCFA, { message: 'Montant anormalement élevé — vérifiez la saisie.' })
  salaireBrutMensuel: number | null;
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
