import type {
  BureauARegler,
  Facturation,
  FactureCentrale,
  JalonFacture,
  ModePaiement,
  ProjetRef,
  StatutFacture,
} from './types';
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

// Projets de la société, réf. courte — pour la section Facturation.
export function getProjetsFacturation(slug: string): Promise<ProjetRef[]> {
  return apiSociete<ProjetRef[]>(slug, '/factures/projets');
}

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

// Facture (brouillon) de la mensualité du mois d'une ligne SU / EX de l'offre.
export function creerMensualite(
  slug: string,
  projetId: string,
  ligneDevisId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/mensualites`, {
    method: 'POST',
    body: { ligneDevisId },
  });
}

// Refacturation des études : une facture, une ligne par étude (bureau × 1,10).
export function refacturerEtudes(
  slug: string,
  projetId: string,
  blocIds: string[],
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/refacturation-etudes`, {
    method: 'POST',
    body: { blocIds },
  });
}

// Règlement du bureau d'études (après encaissement du client) — CFO.
export function marquerBureauRegle(
  slug: string,
  projetId: string,
  blocId: string,
): Promise<Facturation> {
  return apiSociete<Facturation>(slug, `${base(projetId)}/etudes/${blocId}/reglement`, {
    method: 'POST',
  });
}

// Bureaux d'études à régler, toute la société (finances_charges).
export function getBureauxARegler(slug: string): Promise<BureauARegler[]> {
  return apiSociete<BureauARegler[]>(slug, '/factures/bureaux-a-regler');
}

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

// -----------------------------------------------------------------------------
// Vue centralisée (page « Facturation ») — liste à plat, tous projets
// confondus. GET …/factures[?statut&projetId&clientId]. Contrairement à
// Facturation ci-dessus (scopée à un projet, inchangée), sert la page
// centrale : KPI + onglet Factures.
// -----------------------------------------------------------------------------

export function getFacturesCentrale(
  slug: string,
  filtres: { statut?: StatutFacture; projetId?: string; clientId?: string } = {},
): Promise<FactureCentrale[]> {
  const params = new URLSearchParams();
  if (filtres.statut) params.set('statut', filtres.statut);
  if (filtres.projetId) params.set('projetId', filtres.projetId);
  if (filtres.clientId) params.set('clientId', filtres.clientId);
  const qs = params.toString();
  return apiSociete<FactureCentrale[]>(slug, `/factures${qs ? `?${qs}` : ''}`);
}

// Relance MANUELLE d'une facture en retard (cf. cadrage « Devis » §Zervant :
// pas de scheduler dans ce backend, donc pas de relance automatique — c'est
// un geste que l'admin déclenche lui-même, au moment qu'il juge utile).
export function relancerFacture(slug: string, factureId: string): Promise<{ envoye: boolean }> {
  return apiSociete<{ envoye: boolean }>(slug, `/factures/${factureId}/relance`, {
    method: 'POST',
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
