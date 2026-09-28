import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

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
