import type { Foncier, LigneGabaritFoncier, GroupeFoncierCle } from './types';
import { apiSociete } from './client-api';

// Section « Foncier » (Unbord côté backend) — API NestJS :
//   GET    …/projets/:id/unbord                   checklist du projet
//   PATCH  …/projets/:id/unbord/blocs/:groupe      { responsableId }
//   PATCH  …/projets/:id/unbord/:ligneId           { nonRequise }
//   POST   …/projets/:id/unbord/:ligneId/fichiers  { fichiers }
//   POST   …/projets/:id/unbord/:ligneId/images    { fichiers }
// Gabarit (configuration société, societe_admin ou CIO — hors fiche projet) :
//   GET/POST     …/unbord-gabarit
//   PATCH        …/unbord-gabarit/:id              { libelle }
//   PATCH        …/unbord-gabarit/reordonner       { ids }
//   DELETE       …/unbord-gabarit/:id

type FichierEntree = { nom: string; url: string; taille?: number };

export function getFoncier(slug: string, projetId: string): Promise<Foncier> {
  return apiSociete<Foncier>(slug, `/projets/${projetId}/unbord`);
}

export function patchItemFoncier(
  slug: string,
  projetId: string,
  ligneId: string,
  patch: { fait?: boolean; nonRequise?: boolean },
): Promise<Foncier> {
  return apiSociete<Foncier>(slug, `/projets/${projetId}/unbord/${ligneId}`, {
    method: 'PATCH',
    body: patch,
  });
}

// Responsable d'un bloc — admin, ou dispatcher de la cellule concernée
// (règle exacte de estAutoriseAAssigner, même que Permis), ou l'acteur
// lui-même sur un bloc actuellement libre.
export function patchBlocFoncier(
  slug: string,
  projetId: string,
  groupe: GroupeFoncierCle,
  responsableId: string | null,
): Promise<Foncier> {
  return apiSociete<Foncier>(slug, `/projets/${projetId}/unbord/blocs/${groupe}`, {
    method: 'PATCH',
    body: { responsableId },
  });
}

export function joindreFichiersFoncier(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: FichierEntree[],
): Promise<Foncier> {
  return apiSociete<Foncier>(slug, `/projets/${projetId}/unbord/${ligneId}/fichiers`, {
    method: 'POST',
    body: { fichiers },
  });
}

export function joindreImagesFoncier(
  slug: string,
  projetId: string,
  ligneId: string,
  fichiers: FichierEntree[],
): Promise<Foncier> {
  return apiSociete<Foncier>(slug, `/projets/${projetId}/unbord/${ligneId}/images`, {
    method: 'POST',
    body: { fichiers },
  });
}

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
