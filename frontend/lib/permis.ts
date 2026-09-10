import type { Permis } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Permis de construire (conception uniquement). API NestJS :
//   GET   /api/societes/:slug/projets/:id/permis
//   PATCH /api/societes/:slug/projets/:id/permis          (dossier imbriqué)
//   POST  /api/societes/:slug/projets/:id/permis/journal  { texte }
// Le serveur applique la garde de dépôt (NICAD obtenu + dossier 5/5) et
// horodate dépôt / obtention / refus. Compteur des 90 jours = helper front
// `joursRestantsInstruction` sur l'objet renvoyé.
// -----------------------------------------------------------------------------

export function getPermis(slug: string, projetId: string): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis`);
}

export function enregistrerPermis(
  slug: string,
  projetId: string,
  patch: Partial<Omit<Permis, 'projetId' | 'journal'>>,
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis`, {
    method: 'PATCH',
    body: patch,
  });
}

// L'auteur est l'utilisateur du token — 4ᵉ argument conservé pour la
// signature d'appel, non transmis.
export function ajouterEntreeJournal(
  slug: string,
  projetId: string,
  texte: string,
  _auteur: string,
): Promise<Permis> {
  return apiSociete<Permis>(slug, `/projets/${projetId}/permis/journal`, {
    method: 'POST',
    body: { texte },
  });
}
