import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

// PATCH …/projets-ouverts/:id/taches/:tacheId/assignation — null = retirer.
export class AssignerTacheDto {
  @ValidateIf((_, v) => v !== null) @IsString() collaborateurId!: string | null;
  // true = toutes les tâches encore ouvertes de la carte.
  @IsOptional() @IsBoolean() carte?: boolean;
}
