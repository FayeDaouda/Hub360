import { apiSociete } from './client-api';
import type { AttentionPilotage, VuePilotage } from './types';

// Pilotage · tableau de bord Holding : chaque action renvoie la vue à jour.

export function getPilotage(slug: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, '/pilotage');
}

export function getAttention(slug: string): Promise<AttentionPilotage> {
  return apiSociete<AttentionPilotage>(slug, '/pilotage/attention');
}

export function deposerReporting(slug: string, type: 'direction' | 'rh', mois: string, analyse: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, `/pilotage/reportings/${type}/${mois}/depot`, { method: 'POST', body: { analyse } });
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

// Journal d'audit (Pilotage › Journal) : CEO, CIO, administration. Période
// [debut, fin] incluse, 30 derniers jours par défaut, un an au plus.
export type CategorieAudit = 'comptes' | 'droits' | 'finances' | 'reglages' | 'rh';
export type LigneAudit = { id: string; le: string; categorie: CategorieAudit; action: string; detail: string; par: string | null };
export type JournalAudit = { debut: string; fin: string; lignes: LigneAudit[] };

export function getJournalAudit(slug: string, debut?: string, fin?: string): Promise<JournalAudit> {
  const q = new URLSearchParams({ ...(debut ? { debut } : {}), ...(fin ? { fin } : {}) }).toString();
  return apiSociete<JournalAudit>(slug, `/journal-audit${q ? `?${q}` : ''}`);
}
