import { apiSociete } from './client-api';
import type { AttentionPilotage, VuePilotage } from './types';

// Pilotage · tableau de bord Holding : chaque action renvoie la vue à jour.

export function getPilotage(slug: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, '/pilotage');
}

export function getAttention(slug: string): Promise<AttentionPilotage> {
  return apiSociete<AttentionPilotage>(slug, '/pilotage/attention');
}

export function deposerReporting(slug: string, type: 'direction' | 'rh', mois: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, `/pilotage/reportings/${type}/${mois}/depot`, { method: 'POST' });
}

export type NouvelleDecision = {
  instance: string;
  texte: string;
  date?: string;
  responsableRole?: string;
  responsableCollaborateurId?: string;
  echeance: string;
};

export function saisirDecision(slug: string, decision: NouvelleDecision): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, '/pilotage/decisions', { method: 'POST', body: decision });
}

export function cloturerDecision(slug: string, id: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, `/pilotage/decisions/${id}/cloture`, { method: 'POST' });
}
