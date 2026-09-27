import type { BlocGabaritEtude, Etudes, StatutEtude } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Études techniques (conception uniquement). API NestJS :
//   GET    /api/societes/:slug/projets/:id/etudes
//   PATCH  /api/societes/:slug/projets/:id/etudes/blocs/:blocId
//   PATCH  /api/societes/:slug/projets/:id/etudes/items/:itemId
//   POST   /api/societes/:slug/projets/:id/etudes/items/:itemId/images
//   POST   /api/societes/:slug/projets/:id/etudes/items/:itemId/fichiers
//   POST   /api/societes/:slug/projets/:id/etudes/dce   (garde etudesCompletes)
//   DELETE /api/societes/:slug/projets/:id/etudes/dce
//
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

export function getEtudes(slug: string, projetId: string): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes`);
}

export type PatchBlocEtude = Partial<{
  interlocuteur: string;
  contactInterlocuteur: string;
  statut: StatutEtude;
  dateRemisePrevue: string | null;
  dateRemiseReelle: string | null;
  note: string;
  factureMontant: number | null;
  factureFichierNom: string | null;
  factureFichierCle: string | null;
}>;

export function patchBlocEtude(
  slug: string,
  projetId: string,
  blocId: string,
  patch: PatchBlocEtude,
): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/blocs/${blocId}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function patchItemEtude(
  slug: string,
  projetId: string,
  itemId: string,
  patch: { fait?: boolean; nonRequise?: boolean },
): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/items/${itemId}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function joindreImagesItemEtude(
  slug: string,
  projetId: string,
  itemId: string,
  fichiers: { nom: string; url: string }[],
): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/items/${itemId}/images`, {
    method: 'POST',
    body: { fichiers },
  });
}

export function joindreFichiersItemEtude(
  slug: string,
  projetId: string,
  itemId: string,
  fichiers: { nom: string; url: string; taille?: number }[],
): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/items/${itemId}/fichiers`, {
    method: 'POST',
    body: { fichiers },
  });
}

export function constituerDce(slug: string, projetId: string): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/dce`, {
    method: 'POST',
    body: {},
  });
}

export function annulerDce(slug: string, projetId: string): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/dce`, {
    method: 'DELETE',
  });
}

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
