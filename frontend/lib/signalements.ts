import { apiSociete } from './client-api';
import { telechargerFichier } from './fichiers';

// « Signaler un problème » (aide de la barre du haut) et leur suivi par le
// CIO (Réglages › Signalements).
export type StatutSignalement = 'a_traiter' | 'en_cours' | 'corrige';
export type Signalement = {
  id: string;
  description: string;
  page: string;
  role: string;
  appareil: 'mobile' | 'ordinateur';
  statut: StatutSignalement;
  creeLe: string;
  traiteLe: string | null;
  auteur: string | null;
  aCapture: boolean;
};

export const STATUTS_SIGNALEMENT: Record<StatutSignalement, { libelle: string; ton: string }> = {
  a_traiter: { libelle: 'À traiter', ton: 'attention' },
  en_cours: { libelle: 'En cours', ton: 'info' },
  corrige: { libelle: 'Corrigé', ton: 'succes' },
};

export const creerSignalement = (
  slug: string,
  corps: { description: string; page: string; appareil: 'mobile' | 'ordinateur'; capture?: string },
) => apiSociete<{ id: string }>(slug, '/signalements', { method: 'POST', body: corps });

export const getSignalements = (slug: string) => apiSociete<Signalement[]>(slug, '/signalements');

export const changerStatutSignalement = (slug: string, id: string, statut: StatutSignalement) =>
  apiSociete<Signalement[]>(slug, `/signalements/${id}`, { method: 'PATCH', body: { statut } });

export async function ouvrirCaptureSignalement(slug: string, id: string) {
  const f = await apiSociete<{ nom: string; url: string }>(slug, `/signalements/${id}/capture`);
  telechargerFichier(f);
}
