import { apiAuth } from './client-api';
import type { StatutCrm } from './types';

// Déblocages de l'Administrateur HUB (Administration du HUB › Déblocages) :
//   GET  /societes/:slug/interventions?code=             état du dossier et de son projet
//   POST /societes/:slug/interventions/dossiers/:id/onboard      { motif } — Onboard sans signature
//   POST /societes/:slug/interventions/dossiers/:id/reouverture  { motif } — dossier perdu rouvert
//   POST /societes/:slug/interventions/projets/:id/ouverture     { motif } — projet ouvert sans F1
//   PUT  /societes/:slug/interventions/projets/:id/cellules      { celluleIds, motif }

export type CelluleIntervention = { id: string; nom: string; code: string };

export type EtatInterventions = {
  dossier: {
    id: string;
    code: string;
    statut: StatutCrm;
    client: string;
    offreAcceptee: boolean;
    contratSigne: boolean;
  } | null;
  projet: {
    id: string;
    code: string;
    ouvertLe: string | null;
    gabarit: boolean;
    cellules: CelluleIntervention[];
  } | null;
  cellulesDisponibles: CelluleIntervention[];
  historique: {
    id: string;
    type:
      | 'onboard_sans_signature'
      | 'ouverture_projet'
      | 'cellules_projet'
      | 'reouverture_dossier'
      | 'module_desactive'
      | 'module_reactive'
      | 'maintenance_activee'
      | 'maintenance_levee';
    detail: string;
    motif: string;
    par: string | null;
    le: string;
  }[];
};

const base = (slug: string) => `/societes/${slug}/interventions`;

export function getEtatInterventions(slug: string, code: string): Promise<EtatInterventions> {
  return apiAuth(`${base(slug)}?code=${encodeURIComponent(code)}`);
}

export function onboarderSansSignature(slug: string, dossierId: string, motif: string): Promise<EtatInterventions> {
  return apiAuth(`${base(slug)}/dossiers/${dossierId}/onboard`, { method: 'POST', body: { motif } });
}

export function rouvrirDossier(slug: string, dossierId: string, motif: string): Promise<EtatInterventions> {
  return apiAuth(`${base(slug)}/dossiers/${dossierId}/reouverture`, { method: 'POST', body: { motif } });
}

export function ouvrirProjet(slug: string, projetId: string, motif: string): Promise<EtatInterventions> {
  return apiAuth(`${base(slug)}/projets/${projetId}/ouverture`, { method: 'POST', body: { motif } });
}

export function changerCellulesProjet(
  slug: string,
  projetId: string,
  celluleIds: string[],
  motif: string,
): Promise<EtatInterventions> {
  return apiAuth(`${base(slug)}/projets/${projetId}/cellules`, { method: 'PUT', body: { celluleIds, motif } });
}
