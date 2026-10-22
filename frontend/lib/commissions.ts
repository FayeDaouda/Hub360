import { apiSociete } from './client-api';
import type { ModePaiement } from './types';

// Commissions des apporteurs (revue COO, 22/10/2026) — backend crm/commissions.service.ts.
export type CoordonneesApporteur = { banque: string; rib: string; wave: string; orangeMoney: string };
export type CommissionApporteur = {
  id: string;
  dossierId: string;
  code: string;
  client: string;
  apporteur: string;
  structure: string | null;
  source: 'encaissement' | 'signature';
  baseHt: number;
  taux: number;
  montant: number;
  exigibleLe: string;
  statut: 'a_payer' | 'payee';
  payeeLe: string | null;
  payeePar: string | null;
  modePaiement: ModePaiement | null;
  reference: string;
  coordonnees: CoordonneesApporteur | null; // null = pas le droit (ou non renseignées)
};
export type ListeCommissions = { peutPayer: boolean; lignes: CommissionApporteur[] };

export function getCommissions(slug: string): Promise<ListeCommissions> {
  return apiSociete<ListeCommissions>(slug, '/commissions');
}

export function payerCommission(slug: string, id: string, paiement: { date: string; mode: ModePaiement; reference?: string }): Promise<ListeCommissions> {
  return apiSociete<ListeCommissions>(slug, `/commissions/${id}/paiement`, { method: 'POST', body: paiement });
}

export type FicheCoordonnees = { coordonnees: CoordonneesApporteur; confirmation: 'code' | 'mot_de_passe'; peutModifier: boolean };

export function getCoordonneesApporteur(slug: string, dossierId: string): Promise<FicheCoordonnees> {
  return apiSociete<FicheCoordonnees>(slug, `/commissions/coordonnees/${dossierId}`);
}

export function modifierCoordonneesApporteur(slug: string, dossierId: string, c: CoordonneesApporteur & { confirmation?: string }): Promise<FicheCoordonnees> {
  return apiSociete<FicheCoordonnees>(slug, `/commissions/coordonnees/${dossierId}`, { method: 'PUT', body: c });
}

export const LIBELLES_COORDONNEES: Record<keyof CoordonneesApporteur, string> = { banque: 'Banque', rib: 'RIB / IBAN', wave: 'Wave', orangeMoney: 'Orange Money' };
