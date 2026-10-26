import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { UrlFichierJoint } from '../../commun/fichier-joint';

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
// POST …/taches/:tacheId/remise — fichiers et commentaire facultatifs.
export class PieceRemiseDto {
  @IsString() @MaxLength(300) nom!: string;
  @UrlFichierJoint(20_000_000, 'projet') url!: string;
}
export const MAX_PIECES_REMISE = 5;
export class RemettreTacheDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PIECES_REMISE)
  @ValidateNested({ each: true })
  @Type(() => PieceRemiseDto)
  pieces?: PieceRemiseDto[];
  @IsOptional() @IsString() @MaxLength(500) commentaire?: string;
}

export class DeciderTacheDto {
  @IsIn(['valider', 'renvoyer']) decision!: 'valider' | 'renvoyer';
  // Renvoi en reprise : le motif est obligatoire.
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

// POST …/projets-ouverts/:id/ts — élément ajouté par le client (Architecte DPLG).
export class AjouterTsDto {
  @IsString() carteId!: string;
  @IsString() @MinLength(2) @MaxLength(80) element!: string;
  // Produit du devis d'avenant, choisi par l'Architecte DPLG : reprise mineure
  // (TS-MIN, forfait) ou majeure (TS-MAJ : tarif CO × surface × planches).
  @IsIn(['mineure', 'majeure']) reprise!: 'mineure' | 'majeure';
  @ValidateIf((o) => o.reprise === 'majeure') @IsInt() @Min(1) surfaceM2?: number;
  @ValidateIf((o) => o.reprise === 'majeure') @IsInt() @Min(1) planches?: number;
}

// POST …/taches/:tacheId/visa — l'architecte DPLG (Dir. GC) : apposer, ou
// refuser avec un motif (la tâche repart en reprise).
export class ViserTacheDto {
  @IsBoolean() apposer!: boolean;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

// POST …/ts/demandes/:demandeId/decision — le CTO, TS au-delà du seuil.
export class DeciderDemandeTsDto {
  @IsBoolean() accepter!: boolean;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

// POST …/taches/:tacheId/prolongation — par la personne assignée.
export class DemanderProlongationTacheDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) jusquau!: string;
  @IsString() @MinLength(3) @MaxLength(500) motif!: string;
}

// POST …/taches/:tacheId/prolongation/decision — chef de team ou DPLG.
export class DeciderProlongationTacheDto {
  @IsBoolean() accorder!: boolean;
}

// PATCH …/projets-ouverts/:id/visite — date de visite sur site ; null = effacer.
export class DateVisiteDto {
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date attendue au format AAAA-MM-JJ.' })
  date!: string | null;
}

// PATCH …/projets-ouverts/:id/chantier — statut simple du projet (décision du
// 14/10/2026, en attendant les étapes de fin de projet du gabarit).
export class StatutChantierDto {
  @IsIn(['conception', 'chantier', 'livre']) statut!: 'conception' | 'chantier' | 'livre';
}
