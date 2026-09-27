import type { Devis, DevisEnvoye, DevisPublic, ProduitService, StatutDevis } from './types';
import { apiPublic, apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Devis (brique « gestion », 2ᵉ étage après Facturation) — module admin-only,
// CENTRALISÉ (pas de :projetId dans l'URL, cf. cadrage « Devis »). API NestJS :
//   GET    …/devis[?statut&projetId&clientId]
//   GET    …/devis/:id
//   POST   …/devis                        → brouillon
//   PATCH  …/devis/:id                    → brouillon uniquement
//   DELETE …/devis/:id                    → brouillon uniquement
//   POST   …/devis/:id/envoi              → attribue le numéro + jeton public
//   POST   …/devis/:id/reponse            → validation MANUELLE (accepte/refuse)
//   POST   …/devis/:id/conversion         → crée la Facture liée
// -----------------------------------------------------------------------------

export function getDevisListe(
  slug: string,
  filtres: { statut?: StatutDevis; projetId?: string; clientId?: string } = {},
): Promise<Devis[]> {
  const params = new URLSearchParams();
  if (filtres.statut) params.set('statut', filtres.statut);
  if (filtres.projetId) params.set('projetId', filtres.projetId);
  if (filtres.clientId) params.set('clientId', filtres.clientId);
  const qs = params.toString();
  return apiSociete<Devis[]>(slug, `/devis${qs ? `?${qs}` : ''}`);
}

export function getDevis(slug: string, id: string): Promise<Devis> {
  return apiSociete<Devis>(slug, `/devis/${id}`);
}

export type LigneDevisSaisie = {
  produitServiceId?: string;
  designation: string;
  quantite: number;
  // Ligne CO : le serveur recalcule quantité = surface × planches.
  surfaceM2?: number;
  planches?: number;
  prixUnitaire: number;
  tauxTva?: number;
};

export type NouveauDevis = {
  clientId: string;
  projetId?: string;
  // Offre d'un dossier CRM : client du dossier, sans projet ni validité
  // (fixée à 7 jours par la validation DAF qui l'envoie).
  dossierCrmId?: string;
  objet?: string;
  dateValidite?: string;
  lignes: LigneDevisSaisie[];
};

export function creerDevis(slug: string, body: NouveauDevis): Promise<Devis> {
  return apiSociete<Devis>(slug, '/devis', { method: 'POST', body });
}

export function majDevis(
  slug: string,
  id: string,
  patch: Partial<NouveauDevis>,
): Promise<Devis> {
  return apiSociete<Devis>(slug, `/devis/${id}`, { method: 'PATCH', body: patch });
}

export function supprimerDevis(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/devis/${id}`, { method: 'DELETE', sansCorps: true });
}

export function envoyerDevis(slug: string, id: string): Promise<DevisEnvoye> {
  return apiSociete<DevisEnvoye>(slug, `/devis/${id}/envoi`, { method: 'POST' });
}

export function marquerReponseDevis(
  slug: string,
  id: string,
  reponse: 'accepte' | 'refuse',
): Promise<Devis> {
  return apiSociete<Devis>(slug, `/devis/${id}/reponse`, { method: 'POST', body: { reponse } });
}

// Relance d'un devis en attente de réponse — régénère le lien (l'ancien ne
// marche plus) : `lienPublic` est le repli si l'email ne part pas.
export function relancerDevis(slug: string, id: string): Promise<DevisEnvoye> {
  return apiSociete<DevisEnvoye>(slug, `/devis/${id}/relance`, { method: 'POST' });
}

export function convertirDevis(
  slug: string,
  id: string,
): Promise<{ devis: Devis; factureId: string }> {
  return apiSociete<{ devis: Devis; factureId: string }>(slug, `/devis/${id}/conversion`, {
    method: 'POST',
  });
}

// -----------------------------------------------------------------------------
// Lien public (sans compte) — GET/POST …/devis-public/:token. Le jeton EST
// l'authentification, cf. DevisPublicGuard côté backend.
// -----------------------------------------------------------------------------

export function getDevisPublic(token: string): Promise<DevisPublic> {
  return apiPublic<DevisPublic>(`/devis-public/${token}`);
}

export function repondreDevisPublic(
  token: string,
  reponse: 'accepte' | 'refuse',
): Promise<DevisPublic> {
  return apiPublic<DevisPublic>(`/devis-public/${token}/reponse`, {
    method: 'POST',
    body: { reponse },
  });
}

// -----------------------------------------------------------------------------
// Catalogue produits/services — optionnel, admin-only. API NestJS :
//   GET    …/produits-services
//   POST   …/produits-services
//   PATCH  …/produits-services/:id
//   DELETE …/produits-services/:id (soft-delete)
// -----------------------------------------------------------------------------

export type NouveauProduitService = {
  designation: string;
  prixUnitaire?: number;
  tauxTva?: number;
  description?: string;
};

export function getProduitsServices(slug: string): Promise<ProduitService[]> {
  return apiSociete<ProduitService[]>(slug, '/produits-services');
}

export function creerProduitService(
  slug: string,
  body: NouveauProduitService,
): Promise<ProduitService> {
  return apiSociete<ProduitService>(slug, '/produits-services', { method: 'POST', body });
}

export function majProduitService(
  slug: string,
  id: string,
  patch: Partial<NouveauProduitService>,
): Promise<ProduitService> {
  return apiSociete<ProduitService>(slug, `/produits-services/${id}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function supprimerProduitService(slug: string, id: string): Promise<void> {
  return apiSociete<void>(slug, `/produits-services/${id}`, { method: 'DELETE', sansCorps: true });
}
