import type { TypeReporting } from '@prisma/client';
import { moisDe, moisEntre } from '../rh/regles-temps';

// Pilotage · tableau de bord Holding (maquettes du boss, sept.–oct. 2026) —
// règles pures : reportings mensuels (manuel §9.4, dépôt à J+5), registre des
// décisions (§4.1) et évaluation des indicateurs contre leurs objectifs.
// Dates AAAA-MM-JJ, mois AAAA-MM.

// --- Reportings mensuels --------------------------------------------------

// Premier mois soumis au reporting : celui où le HUB commence à porter les
// données (même départ que les feuilles de temps).
export const MOIS_DEBUT_REPORTINGS = '2026-09';

// Jour du mois suivant où le reporting est dû (« J+5 » : 05/10 pour septembre).
export const JOUR_DEPOT_REPORTING = 5;

// Émetteur → destinataire, d'après la maquette (rôles de la matrice).
export const REPORTINGS: Record<TypeReporting, { emetteur: string; destinataire: string }> = {
  direction: { emetteur: 'Dir. GC', destinataire: 'CTO (transverse)' },
  rh: { emetteur: 'RH', destinataire: 'CFO' },
};

export function moisSuivant(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export const echeanceReporting = (mois: string) => `${moisSuivant(mois)}-${String(JOUR_DEPOT_REPORTING).padStart(2, '0')}`;

// Mois clos soumis au reporting, du plus ancien au plus récent.
export function moisAReporter(aujourdhui: string): string[] {
  return moisEntre(MOIS_DEBUT_REPORTINGS, moisDe(aujourdhui)).filter((m) => m < moisDe(aujourdhui));
}

export type StatutReporting = 'a_deposer' | 'en_retard' | 'depose' | 'depose_en_retard';

export function statutReporting(mois: string, deposeLe: string | null, aujourdhui: string): StatutReporting {
  const echeance = echeanceReporting(mois);
  if (deposeLe) return deposeLe <= echeance ? 'depose' : 'depose_en_retard';
  return aujourdhui <= echeance ? 'a_deposer' : 'en_retard';
}

// Rappels d'un reporting non déposé (revue Dir. GC, 21/10/2026, lot 3) :
//   · à l'émetteur, `joursAvant` jours avant l'échéance (une fois) ;
//   · en retard, à l'émetteur chaque semaine (palier 0, 1, 2…) et au
//     destinataire une seule fois.
// `cle` : suffixe de la clé du rappel (jamais deux fois le même envoi).
export type RappelReporting = { cle: string; cible: 'emetteur' | 'destinataire'; nature: 'avant' | 'retard' };
const jourDecale = (jour: string, n: number) => {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function rappelsReporting(mois: string, depose: boolean, jour: string, joursAvant: number): RappelReporting[] {
  if (depose) return [];
  const echeance = echeanceReporting(mois);
  if (jour > echeance) {
    const retard = Math.round((Date.parse(jour) - Date.parse(echeance)) / 86_400_000);
    return [
      { cle: `retard:${Math.floor((retard - 1) / 7)}`, cible: 'emetteur', nature: 'retard' },
      { cle: 'retard-destinataire', cible: 'destinataire', nature: 'retard' },
    ];
  }
  return jour >= jourDecale(echeance, -joursAvant) ? [{ cle: 'avant', cible: 'emetteur', nature: 'avant' }] : [];
}

// --- Registre des décisions ------------------------------------------------

export const numeroDecision = (n: number) => `D-${String(n).padStart(3, '0')}`;

export type StatutDecision = 'ouverte' | 'echeance_depassee' | 'close';

export function statutDecision(d: { echeance: string | null; closeLe: string | null }, aujourdhui: string): StatutDecision {
  if (d.closeLe) return 'close';
  return d.echeance && d.echeance < aujourdhui ? 'echeance_depassee' : 'ouverte';
}

// Instances qui saisissent leurs décisions dans le HUB (maquette) ; les
// autres décisions sont inscrites par le HUB lui-même.
export const INSTANCES_SAISIE = ['CODIR', 'Coordination opérationnelle'] as const;

// --- Indicateurs -----------------------------------------------------------

export type Evaluation = 'dans_objectif' | 'hors_objectif' | 'a_fixer' | 'sans_donnee';

export type Objectif =
  | { type: 'minimum'; valeur: number | null; propose?: number } // valeur ≥ objectif
  | { type: 'maximum'; valeur: number | null; propose?: number } // valeur ≤ seuil
  | { type: 'zone'; de: number | null; a: number | null; propose?: { de: number; a: number } };

// Hors objectif / dans l'objectif quand l'objectif est fixé ; « à fixer »
// sinon — la valeur proposée ne sert qu'à la couleur (`atteintPropose`).
export function evaluer(valeur: number | null, o: Objectif): { evaluation: Evaluation; atteintPropose: boolean } {
  if (valeur == null) return { evaluation: 'sans_donnee', atteintPropose: false };
  const dans = (v: number, cible: Objectif): boolean | null => {
    if (cible.type === 'zone') return cible.de == null || cible.a == null ? null : v >= cible.de && v <= cible.a;
    if (cible.valeur == null) return null;
    return cible.type === 'minimum' ? v >= cible.valeur : v <= cible.valeur;
  };
  const fixe = dans(valeur, o);
  if (fixe != null) return { evaluation: fixe ? 'dans_objectif' : 'hors_objectif', atteintPropose: false };
  const propose =
    o.type === 'zone'
      ? o.propose && dans(valeur, { type: 'zone', ...o.propose })
      : o.propose != null && dans(valeur, { type: o.type, valeur: o.propose });
  return { evaluation: 'a_fixer', atteintPropose: !!propose };
}

export const pourcentage = (n: number, sur: number): number | null => (sur > 0 ? Math.round((n / sur) * 100) : null);
