import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

// POST …/canaux/:id/messages — texte brut, plafonné (cf. artifact « Chat
// multi-canaux » §4). Pas d'édition ni de suppression en v1.
export class EnvoyerMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) texte!: string;
}

// POST …/canaux/direct — ouvre ou récupère le DM avec cet utilisateur.
export class OuvrirDirectDto {
  @IsUUID() avecUtilisateurId!: string;
}
