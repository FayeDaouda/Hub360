import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UrlFichierJoint } from '../commun/fichier-joint';
import { EMOJIS } from './chat.service';

// POST …/canaux/:id/messages — texte brut, plafonné (cf. artifact « Chat
// multi-canaux » §4). Pas d'édition ni de suppression en v1.
// Pièce jointe d'un message (photo de chantier, PDF…) : 8 Mo réels au plus.
export class PieceMessageDto {
  @IsString() @MinLength(1) @MaxLength(200) nom!: string;
  @UrlFichierJoint(11_200_000, 'projet') url!: string;
}

export class EnvoyerMessageDto {
  // Vide permis quand le message porte des pièces jointes (02/11/2026).
  @IsString() @MaxLength(4000) texte!: string;
  // Personnes mentionnées (@) : prévenues par une notification (01/11/2026).
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) mentionIds?: string[];
  // @tous : chaque lecteur de la conversation (sauf « Général »).
  @IsOptional() @IsBoolean() mentionTous?: boolean;
  @IsOptional() @IsUUID() reponseAId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PieceMessageDto)
  pieces?: PieceMessageDto[];
}

export class ModifierMessageDto {
  @IsString() @MaxLength(4000) texte!: string;
}

export class ReactionDto {
  @IsIn(EMOJIS) emoji!: string;
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
