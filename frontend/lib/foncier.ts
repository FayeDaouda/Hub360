import type { LigneGabaritFoncier, GroupeFoncierCle } from './types';
import { apiSociete } from './client-api';

// Gabarit Foncier (Unbord côté backend) — API NestJS.
// Gabarit (configuration société, societe_admin ou CIO — hors fiche projet) :
//   GET/POST     …/unbord-gabarit
//   PATCH        …/unbord-gabarit/:id              { libelle }
//   PATCH        …/unbord-gabarit/reordonner       { ids }
//   DELETE       …/unbord-gabarit/:id

// -- Gabarit (configuration société) -----------------------------------

export function getGabaritFoncier(slug: string): Promise<LigneGabaritFoncier[]> {
  return apiSociete<LigneGabaritFoncier[]>(slug, '/unbord-gabarit');
}

export function creerLigneGabaritFoncier(
  slug: string,
  groupe: GroupeFoncierCle,
  libelle: string,
): Promise<LigneGabaritFoncier> {
  return apiSociete<LigneGabaritFoncier>(slug, '/unbord-gabarit', {
    method: 'POST',
    body: { groupe, libelle },
  });
}

export function renommerLigneGabaritFoncier(
  slug: string,
  id: string,
  libelle: string,
): Promise<LigneGabaritFoncier> {
  return apiSociete<LigneGabaritFoncier>(slug, `/unbord-gabarit/${id}`, {
    method: 'PATCH',
    body: { libelle },
  });
}

export function reordonnerGabaritFoncier(
  slug: string,
  ids: string[],
): Promise<LigneGabaritFoncier[]> {
  return apiSociete<LigneGabaritFoncier[]>(slug, '/unbord-gabarit/reordonner', {
    method: 'PATCH',
    body: { ids },
  });
}

export function supprimerLigneGabaritFoncier(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/unbord-gabarit/${id}`, { method: 'DELETE', sansCorps: true });
}
