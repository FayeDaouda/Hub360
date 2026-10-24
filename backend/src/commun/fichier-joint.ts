import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';

// Fichier joint transmis en data URI base64 (stocké en base tant que le
// stockage objet n'est pas branché). Seul ce schéma est accepté : le front
// ouvre les fichiers par un lien, et une URL `javascript:…` y exécuterait du
// code dans la session de la personne qui télécharge (audit du 24/10/2026, C1).
export const DATA_URI_BASE64 = /^data:[^,;]*(;[^,;]+)*;base64,[A-Za-z0-9+/]*={0,2}$/;

// Champ `url` d'un fichier joint : data URI base64, au plus `longueurMax` caractères.
export function UrlFichierJoint(longueurMax: number) {
  return applyDecorators(IsString(), MaxLength(longueurMax), Matches(DATA_URI_BASE64, { message: 'Fichier invalide.' }));
}
