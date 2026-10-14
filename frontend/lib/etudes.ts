import type { BlocGabaritEtude } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Gabarit Études. API NestJS :
// Gabarit (configuration société, societe_admin ou CIO — hors fiche projet) :
//   GET    /api/societes/:slug/etudes-gabarit
//   POST   /api/societes/:slug/etudes-gabarit/blocs
//   PATCH  /api/societes/:slug/etudes-gabarit/blocs/reordonner
//   PATCH  /api/societes/:slug/etudes-gabarit/blocs/:id
//   DELETE /api/societes/:slug/etudes-gabarit/blocs/:id
//   POST   /api/societes/:slug/etudes-gabarit/blocs/:blocId/lignes
//   PATCH  /api/societes/:slug/etudes-gabarit/blocs/:blocId/lignes/reordonner
//   PATCH  /api/societes/:slug/etudes-gabarit/lignes/:id
//   DELETE /api/societes/:slug/etudes-gabarit/lignes/:id
// -----------------------------------------------------------------------------

// -- Gabarit (configuration société) -----------------------------------

export function getGabaritEtudes(slug: string): Promise<BlocGabaritEtude[]> {
  return apiSociete<BlocGabaritEtude[]>(slug, '/etudes-gabarit');
}

export function creerBlocGabaritEtude(slug: string, libelle: string): Promise<BlocGabaritEtude> {
  return apiSociete<BlocGabaritEtude>(slug, '/etudes-gabarit/blocs', {
    method: 'POST',
    body: { libelle },
  });
}

export function renommerBlocGabaritEtude(
  slug: string,
  id: string,
  libelle: string,
): Promise<BlocGabaritEtude> {
  return apiSociete<BlocGabaritEtude>(slug, `/etudes-gabarit/blocs/${id}`, {
    method: 'PATCH',
    body: { libelle },
  });
}

export function reordonnerBlocsGabaritEtude(
  slug: string,
  ids: string[],
): Promise<BlocGabaritEtude[]> {
  return apiSociete<BlocGabaritEtude[]>(slug, '/etudes-gabarit/blocs/reordonner', {
    method: 'PATCH',
    body: { ids },
  });
}

export function supprimerBlocGabaritEtude(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/etudes-gabarit/blocs/${id}`, {
    method: 'DELETE',
    sansCorps: true,
  });
}

export function creerLigneGabaritEtude(
  slug: string,
  blocId: string,
  libelle: string,
): Promise<{ id: string; blocEtudeGabaritId: string; libelle: string; ordre: number }> {
  return apiSociete(slug, `/etudes-gabarit/blocs/${blocId}/lignes`, {
    method: 'POST',
    body: { libelle },
  });
}

export function reordonnerLignesGabaritEtude(
  slug: string,
  blocId: string,
  ids: string[],
): Promise<{ id: string; blocEtudeGabaritId: string; libelle: string; ordre: number }[]> {
  return apiSociete(slug, `/etudes-gabarit/blocs/${blocId}/lignes/reordonner`, {
    method: 'PATCH',
    body: { ids },
  });
}

export function renommerLigneGabaritEtude(
  slug: string,
  id: string,
  libelle: string,
): Promise<{ id: string; blocEtudeGabaritId: string; libelle: string; ordre: number }> {
  return apiSociete(slug, `/etudes-gabarit/lignes/${id}`, {
    method: 'PATCH',
    body: { libelle },
  });
}

export function supprimerLigneGabaritEtude(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/etudes-gabarit/lignes/${id}`, {
    method: 'DELETE',
    sansCorps: true,
  });
}
