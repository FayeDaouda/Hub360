import type { MonProfil } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Espace collaborateur (interface réduite). API NestJS :
//   GET  …/mon-profil        fiche du collaborateur connecté (404 si pas de fiche)
// Les modules « Mes projets » / « Mes indicateurs » se brancheront ici une fois
// les gardes d'accès serveur en place (étapes 3 & 4).
// -----------------------------------------------------------------------------

export function getMonProfil(slug: string): Promise<MonProfil> {
  return apiSociete<MonProfil>(slug, '/mon-profil');
}
