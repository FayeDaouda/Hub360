import { apiSociete } from './client-api';
import type { AttentionPilotage, ReportingADeposer, VuePilotage } from './types';

// Pilotage · tableau de bord Holding : chaque action renvoie la vue à jour.

export function getPilotage(slug: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, '/pilotage');
}

export function getAttention(slug: string): Promise<AttentionPilotage> {
  return apiSociete<AttentionPilotage>(slug, '/pilotage/attention');
}

export function getReportingsADeposer(slug: string): Promise<ReportingADeposer[]> {
  return apiSociete<ReportingADeposer[]>(slug, '/pilotage/reportings/a-deposer');
}

export type ReportingRecu = { type: 'direction' | 'rh'; mois: string; periode: string; deposeLe: string; emetteur: string; lu: boolean };
export function getReportingsRecus(slug: string): Promise<ReportingRecu[]> {
  return apiSociete<ReportingRecu[]>(slug, '/pilotage/reportings/recus');
}

// Suivi d'un reporting déposé (revue CFO, lot 5) : chaque action rend la vue.
export const lireReporting = (slug: string, type: 'direction' | 'rh', mois: string) =>
  apiSociete<VuePilotage>(slug, `/pilotage/reportings/${type}/${mois}/lecture`, { method: 'POST', body: {} });
export const poserQuestionReporting = (slug: string, type: 'direction' | 'rh', mois: string, texte: string) =>
  apiSociete<VuePilotage>(slug, `/pilotage/reportings/${type}/${mois}/questions`, { method: 'POST', body: { texte } });
export const repondreQuestionReporting = (slug: string, type: 'direction' | 'rh', mois: string, questionId: string, texte: string) =>
  apiSociete<VuePilotage>(slug, `/pilotage/reportings/${type}/${mois}/questions/${questionId}/reponse`, { method: 'POST', body: { texte } });
export type QuestionOuverte = { id: string; type: 'direction' | 'rh'; mois: string; periode: string; titre: string; le: string; par: string | null };
export const getQuestionsOuvertes = (slug: string) => apiSociete<QuestionOuverte[]>(slug, '/pilotage/reportings/questions-ouvertes');

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
  projetId?: string;
  celluleId?: string;
  clientId?: string;
  proposer?: boolean; // CTO : soumettre au CEO au lieu d'inscrire
};

// Arbitrage du CEO sur une décision proposée par le CTO.
export type ArbitrageDecision =
  | { issue: 'accepter' }
  | { issue: 'refuser'; motif: string }
  | { issue: 'modifier'; texte?: string; responsableRole?: string; responsableCollaborateurId?: string; echeance?: string; motif?: string };
export function arbitrerDecision(slug: string, id: string, arbitrage: ArbitrageDecision): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, `/pilotage/decisions/${id}/arbitrage`, { method: 'POST', body: arbitrage });
}

// Décisions rattachées à une fiche (projet, cellule ou client).
export type DecisionRattachee = {
  id: string;
  numero: string;
  date: string;
  instance: string;
  texte: string;
  responsable: string;
  echeance: string | null;
  statut: 'proposee' | 'ouverte' | 'echeance_depassee' | 'close';
};
export function getDecisionsRattachees(slug: string, cible: { projet?: string; cellule?: string; client?: string }): Promise<DecisionRattachee[]> {
  const [cle, id] = Object.entries(cible).find(([, v]) => !!v) ?? ['projet', ''];
  return apiSociete<DecisionRattachee[]>(slug, `/pilotage/decisions?${cle}=${encodeURIComponent(id ?? '')}`);
}

export function saisirDecision(slug: string, decision: NouvelleDecision): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, '/pilotage/decisions', { method: 'POST', body: decision });
}

export function cloturerDecision(slug: string, id: string): Promise<VuePilotage> {
  return apiSociete<VuePilotage>(slug, `/pilotage/decisions/${id}/cloture`, { method: 'POST' });
}

// Journal d'audit (Pilotage › Journal) : CEO, CIO, administration. Période
// [debut, fin] incluse, 30 derniers jours par défaut, un an au plus.
export type CategorieAudit = 'comptes' | 'droits' | 'finances' | 'reglages' | 'rh' | 'paie' | 'pilotage';
export type LigneAudit = { id: string; le: string; categorie: CategorieAudit; action: string; detail: string; par: string | null };
export type JournalAudit = { debut: string; fin: string; lignes: LigneAudit[] };

export function getJournalAudit(slug: string, debut?: string, fin?: string): Promise<JournalAudit> {
  const q = new URLSearchParams({ ...(debut ? { debut } : {}), ...(fin ? { fin } : {}) }).toString();
  return apiSociete<JournalAudit>(slug, `/journal-audit${q ? `?${q}` : ''}`);
}

// Synthèse mensuelle du CEO (revue CEO, 22/10/2026) — backend pilotage/synthese.service.ts.
export type LigneSynthese = { libelle: string; valeur: string; ton?: 'risque' | 'attention' | 'succes' };
export type Synthese = {
  mois: string;
  libelle: string;
  genereLe: string;
  sections: { titre: string; lignes: LigneSynthese[] }[];
  commentaire: { texte: string; par: string | null; le: string | null } | null;
};
export type ListeSyntheses = { peutCommenter: boolean; syntheses: Synthese[] };
export const getSyntheses = (slug: string) => apiSociete<ListeSyntheses>(slug, '/pilotage/syntheses');
export const commenterSynthese = (slug: string, mois: string, texte: string) =>
  apiSociete<ListeSyntheses>(slug, `/pilotage/syntheses/${mois}/commentaire`, { method: 'PUT', body: { texte } });

// Délégation du CEO (revue CEO, 22/10/2026) — backend pilotage/delegation.service.ts.
export type DelegationCeo = { id: string; delegataire: string; role: string; du: string; au: string; enCours: boolean; perimetre: string[] };
export type VueDelegation = { peutGerer: boolean; delegations: DelegationCeo[]; candidats: { id: string; nom: string; role: string }[]; jamais: string[] };
export const getDelegation = (slug: string) => apiSociete<VueDelegation>(slug, '/pilotage/delegation');
export const deleguer = (slug: string, d: { delegataireId: string; du: string; au: string }) =>
  apiSociete<VueDelegation>(slug, '/pilotage/delegation', { method: 'POST', body: d });
export const revoquerDelegation = (slug: string, id: string) =>
  apiSociete<VueDelegation>(slug, `/pilotage/delegation/${id}/revocation`, { method: 'POST' });
