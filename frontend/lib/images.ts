import type { ImageProjet, Phase, UsageImage } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Images d'un projet (galerie de travail + portfolio). API NestJS :
//   GET    …/projets/:id/images[?supprimees=1]
//   POST   …/projets/:id/images                { fichiers: [{ nom, url }] }
//   PATCH  …/projets/:id/images/:imageId       (une image)
//   PATCH  …/projets/:id/images                { ids, patch }  (lot)
//   PUT    …/projets/:id/images/ordre          { ids }
//   DELETE …/projets/:id/images                { ids }         (soft-delete)
//   POST   …/projets/:id/images/:imageId/restauration
// Les fichiers transitent en data URI (redimensionnés client-side) tant que le
// stockage objet S3 n'est pas branché ; le serveur les stocke tels quels et
// renvoie `url`. `ajoutePar` / `supprimePar` = utilisateur du token.
// -----------------------------------------------------------------------------

export function getImagesProjet(
  slug: string,
  projetId: string,
): Promise<ImageProjet[]> {
  return apiSociete<ImageProjet[]>(slug, `/projets/${projetId}/images`);
}

export function getImagesSupprimees(
  slug: string,
  projetId: string,
): Promise<ImageProjet[]> {
  return apiSociete<ImageProjet[]>(
    slug,
    `/projets/${projetId}/images?supprimees=1`,
  );
}

export function ajouterImages(
  slug: string,
  projetId: string,
  fichiers: { nom: string; url: string }[],
  _ajoutePar: string,
): Promise<ImageProjet[]> {
  return apiSociete<ImageProjet[]>(slug, `/projets/${projetId}/images`, {
    method: 'POST',
    body: { fichiers },
  });
}

export function majImage(
  slug: string,
  projetId: string,
  imageId: string,
  patch: { usage?: UsageImage; phase?: Phase | null; legende?: string },
): Promise<ImageProjet> {
  return apiSociete<ImageProjet>(
    slug,
    `/projets/${projetId}/images/${imageId}`,
    { method: 'PATCH', body: patch },
  );
}

export function majImagesEnLot(
  slug: string,
  projetId: string,
  ids: string[],
  patch: { usage?: UsageImage; phase?: Phase | null },
): Promise<ImageProjet[]> {
  return apiSociete<ImageProjet[]>(slug, `/projets/${projetId}/images`, {
    method: 'PATCH',
    body: { ids, patch },
  });
}

export function reordonnerPortfolio(
  slug: string,
  projetId: string,
  idsOrdonnes: string[],
): Promise<ImageProjet[]> {
  return apiSociete<ImageProjet[]>(slug, `/projets/${projetId}/images/ordre`, {
    method: 'PUT',
    body: { ids: idsOrdonnes },
  });
}

export function supprimerImages(
  slug: string,
  projetId: string,
  ids: string[],
  _supprimePar: string,
): Promise<void> {
  return apiSociete<void>(slug, `/projets/${projetId}/images`, {
    method: 'DELETE',
    body: { ids },
    sansCorps: true,
  });
}

export function restaurerImage(
  slug: string,
  projetId: string,
  imageId: string,
): Promise<void> {
  return apiSociete<void>(
    slug,
    `/projets/${projetId}/images/${imageId}/restauration`,
    { method: 'POST', body: {}, sansCorps: true },
  );
}
