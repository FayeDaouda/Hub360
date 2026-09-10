import type { Etudes, LigneEtude, TypeEtude } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Études techniques (conception uniquement). API NestJS :
//   GET    /api/societes/:slug/projets/:id/etudes
//   PATCH  /api/societes/:slug/projets/:id/etudes/lignes/:type
//   POST   /api/societes/:slug/projets/:id/etudes/dce   (garde etudesCompletes)
//   DELETE /api/societes/:slug/projets/:id/etudes/dce
// -----------------------------------------------------------------------------

export function getEtudes(slug: string, projetId: string): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes`);
}

export function majLigneEtude(
  slug: string,
  projetId: string,
  type: TypeEtude,
  patch: Partial<Omit<LigneEtude, 'type'>>,
): Promise<Etudes> {
  return apiSociete<Etudes>(slug, `/projets/${projetId}/etudes/lignes/${type}`, {
    method: 'PATCH',
    body: patch,
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
