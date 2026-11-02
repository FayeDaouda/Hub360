import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// POST …/canaux/:id/messages — texte brut, plafonné (cf. artifact « Chat
// multi-canaux » §4). Pas d'édition ni de suppression en v1.
export class EnvoyerMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) texte!: string;
  // Personnes mentionnées (@) : prévenues par une notification (01/11/2026).
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) mentionIds?: string[];
}

// POST …/canaux/groupes — groupe de discussion (01/11/2026).
export class CreerGroupeDto {
  @IsString() @MinLength(2) @MaxLength(80) nom!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(49) @IsUUID('all', { each: true }) membreIds!: string[];
}

export class AjouterMembresDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(49) @IsUUID('all', { each: true }) membreIds!: string[];
}

export class RenommerGroupeDto {
  @IsString() @MinLength(2) @MaxLength(80) nom!: string;
}

// POST …/canaux/direct — ouvre ou récupère le DM avec cet utilisateur.
export class OuvrirDirectDto {
  @IsUUID() avecUtilisateurId!: string;
}
