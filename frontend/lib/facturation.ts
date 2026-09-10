import type { Facturation, JalonFacture, ModePaiement } from './types';
import { apiSociete } from './client-api';

// -----------------------------------------------------------------------------
// Facturation client (module admin-only). API NestJS :
//   GET    …/projets/:id/factures
//   POST   …/projets/:id/factures                → facture unique (brouillon)
//   POST   …/projets/:id/factures/echeancier     → 3 factures brouillon (jalons)
//   PATCH  …/factures/:factureId                 → brouillon uniquement
//   POST   …/factures/:factureId/emission        → attribue le numéro, verrouille
//   DELETE …/factures/:factureId                 → brouillon uniquement
//   POST   …/factures/:factureId/avoir           → annule via un avoir
//   POST   …/factures/:factureId/paiements
//   DELETE …/factures/:factureId/paiements/:id
// Toutes les mutations renvoient la Facturation complète (comme l'exécution).
// -----------------------------------------------------------------------------

const base = (projetId: string) => `/projets/${projetId}/factures`;

export function getFacturation(slug: string, projetId: string): Promise<Facturation> {
  return apiSociete<Facturation>(slug, base(projetId));
}

export type NouvelleFacture = {
  montantHt?: number;
  tauxTva?: number;
  echeanceLe?: string | null;
  libelle?: string;
};

export function creerFacture(
  slug: string,
  projetId: string,
  body: NouvelleFacture,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, base(projetId), { method: 'POST', body });
}

export type NouvelEcheancier = {
  tauxTva?: number;
  montants: Record<JalonFacture, number>;
  echeances?: Partial<Record<JalonFacture, string>>;
};

export function creerEcheancier(
  slug: string,
  projetId: string,
  body: NouvelEcheancier,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/echeancier`, {
    method: 'POST',
    body,
  });
}

export function majFacture(
  slug: string,
  projetId: string,
  factureId: string,
  patch: NouvelleFacture,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/${factureId}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function emettreFacture(
  slug: string,
  projetId: string,
  factureId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/${factureId}/emission`, {
    method: 'POST',
  });
}

export function supprimerFacture(
  slug: string,
  projetId: string,
  factureId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/${factureId}`, {
    method: 'DELETE',
  });
}

export function creerAvoir(
  slug: string,
  projetId: string,
  factureId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/${factureId}/avoir`, {
    method: 'POST',
  });
}

export type NouveauPaiement = {
  date: string;
  montant: number;
  mode?: ModePaiement;
  reference?: string;
};

export function ajouterPaiement(
  slug: string,
  projetId: string,
  factureId: string,
  body: NouveauPaiement,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/${factureId}/paiements`, {
    method: 'POST',
    body,
  });
}

export function supprimerPaiement(
  slug: string,
  projetId: string,
  factureId: string,
  paiementId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(
    slug,
    `${base(projetId)}/${factureId}/paiements/${paiementId}`,
    { method: 'DELETE' },
  );
}
