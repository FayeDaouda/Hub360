import { apiSociete } from './client-api';
import { formatNumber } from './format';

// Rentabilité par projet, phase 1 (lot 7) : marge directe PROVISOIRE —
// montant HT facturé − coût salarial des heures imputées et contrôlées.
// Montants pour le CFO et le CEO ; le CTO reçoit le taux et la couleur
// (montants à null, filtrés par le serveur).

export type Acces = 'montants' | 'taux';
export type Statut = 'vert' | 'ambre' | 'rouge' | null;
export type EtatDonnees = 'complet' | 'insuffisant' | 'heures_non_suivies';
export type ParametreEnVigueur = {
  cle: 'heures_annuelles' | 'coefficient_charges' | 'marge_cible';
  libelle: string;
  unite: string;
  valeur: number | null;
  parDefaut: boolean;
};

export type LigneRentabilite = {
  projet: { id: string; code: string; programme: string; client: string; statut: string; phase: string };
  ht: number | null;
  cout: number | null;
  marge: number | null; // null aussi quand les données sont insuffisantes
  aFacturer: number | null;
  taux: number | null; // null = « Non calculable »
  statut: Statut;
  heures: number;
  heuresAttente: number;
  prolongations: number;
  reprises: number;
  etat: EtatDonnees;
  raisons: string[];
  misAJour: string | null;
};

export type Portefeuille = {
  acces: Acces;
  periode: string | null; // null = cumul depuis l'ouverture
  arreteAu: string | null; // AAAA-MM : cumul arrêté au dernier mois entièrement contrôlé
  calculeLe: string;
  parametres: ParametreEnVigueur[];
  projetsComplets: number; // les totaux ne portent que sur eux
  // Ce qui empêche le calcul, et qui doit agir (RH : contrôle, salaires ; CFO : validation).
  blocages: {
    feuilles: { mois: string; feuilles: number; projets: number }[];
    salaires: { salaries: number; projets: number };
    rh: string[];
    cfo: string[];
  };
  totaux: { ht: number | null; cout: number | null; marge: number | null; taux: number | null };
  lignes: LigneRentabilite[];
};

export type FicheRentabilite = LigneRentabilite & {
  acces: Acces;
  arreteAu: string | null;
  parametres: ParametreEnVigueur[];
  parHeure: { honoraires: number; cout: number } | null;
  factures:
    | {
        id: string;
        reference: string | null;
        emiseLe: string;
        estAvoir: boolean;
        annulee: boolean;
        libelle: string;
        ht: number;
        horsCumul: boolean;
      }[]
    | null;
  mois: { mois: string; heures: number; cout: number | null; ht: number | null }[];
  salaries: number;
  qualite: string[];
};

export type CoutSalarie = { nom: string; heures: number | null; cout: number | null; sansSalaire: boolean };

export type Parametres = {
  peutModifier: boolean;
  premierMois: string; // AAAA-MM-01
  enVigueur: ParametreEnVigueur[];
  definitions: Record<
    string,
    { libelle: string; defaut: number | null; min: number; max: number; unite: string; videPermis: boolean }
  >;
  historique: {
    cle: string;
    libelle: string;
    valeur: number | null;
    dateEffet: string;
    motif: string;
    par: string | null;
    le: string;
  }[];
};

const base = '/finances/rentabilite';
export const getRentabilite = (slug: string, periode?: string) =>
  apiSociete<Portefeuille>(slug, periode ? `${base}?periode=${periode}` : base);
export const getFicheRentabilite = (slug: string, id: string) =>
  apiSociete<FicheRentabilite>(slug, `${base}/projets/${id}`);
export const getCoutSalaries = (slug: string, id: string) =>
  apiSociete<CoutSalarie[]>(slug, `${base}/projets/${id}/salaries`);
export const getParametresRentabilite = (slug: string) => apiSociete<Parametres>(slug, `${base}/parametres`);
export const modifierParametreRentabilite = (
  slug: string,
  p: { cle: string; valeur: number | null; dateEffet: string; motif: string },
) => apiSociete<Parametres>(slug, `${base}/parametres`, { method: 'POST', body: p });

export const LIBELLE_STATUT: Record<'vert' | 'ambre' | 'rouge', string> = {
  vert: 'Au-dessus de la cible',
  ambre: 'Sous la cible',
  rouge: 'Marge négative',
};
export const PILL_STATUT: Record<'vert' | 'ambre' | 'rouge', string> = {
  vert: 'pill--succes',
  ambre: 'pill--attention',
  rouge: 'pill--risque',
};
export const LIBELLE_ETAT: Record<EtatDonnees, string> = {
  complet: 'Complet',
  insuffisant: 'Données insuffisantes',
  heures_non_suivies: 'Heures non suivies',
};

export const formatTaux = (t: number | null) =>
  t === null ? 'Non calculable' : `${t.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
// Les heures sont stockées par an (valeur exacte) ; le mois est affiché arrondi.
export const formatParametre = (p: { valeur: number | null; unite: string; cle?: string }) =>
  p.valeur === null
    ? p.cle === 'coefficient_charges'
      ? 'désactivé'
      : 'non fixée'
    : p.cle === 'heures_annuelles'
      ? `${formatNumber(p.valeur)} h par an, soit ${(p.valeur / 12).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h par mois`
      : `${formatNumber(p.valeur)} ${p.unite}`;

// « 30 septembre 2026 » : dernier jour du mois arrêté (AAAA-MM).
export function finDeMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
