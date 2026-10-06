import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// PATCH …/projets-ouverts/:id/taches/:tacheId/assignation — null = retirer.
export class AssignerTacheDto {
  @ValidateIf((_, v) => v !== null) @IsString() collaborateurId!: string | null;
  // true = toutes les tâches encore ouvertes de la carte.
  @IsOptional() @IsBoolean() carte?: boolean;
}

// POST …/projets-ouverts/:id/fil — la carte OU la tâche ; parentId = réponse.
export class PublierCommentaireDto {
  @IsOptional() @IsString() carteId?: string;
  @IsOptional() @IsString() tacheId?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsString() @MinLength(1) @MaxLength(2000) texte!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() mentionneId?: string | null;
}

// POST …/projets-ouverts/:id/taches/:tacheId/decision — sur une remise.
export class DeciderTacheDto {
  @IsIn(['valider', 'renvoyer']) decision!: 'valider' | 'renvoyer';
  // Renvoi en reprise : le motif est obligatoire.
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

// POST …/projets-ouverts/:id/ts — élément ajouté par le client (Architecte DPLG).
export class AjouterTsDto {
  @IsString() carteId!: string;
  @IsString() @MinLength(2) @MaxLength(80) element!: string;
}
