import { AUCUN_FERIE, HEURES_PAR_JOUR, type Feries } from '../../rh/regles-temps';
import { addDays, daysBetween } from '../../shared/dates';

// Calendrier ouvrable d'un projet ouvert selon le gabarit : J1 = jour
// d'ouverture (émission de F1) ou le premier jour ouvré qui suit ; Jn = n-ième
// jour ouvré (lundi → vendredi, hors jours fériés des Réglages). Fonctions
// pures, dates AAAA-MM-JJ.

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const lendemain = (iso: string) => addDays(iso, 1);

export function estOuvre(iso: string, feries: Feries = AUCUN_FERIE): boolean {
  const j = jour(iso).getUTCDay();
  return j !== 0 && j !== 6 && !feries.has(iso);
}

export function premierJourOuvre(iso: string, feries: Feries = AUCUN_FERIE): string {
  let d = iso;
  while (!estOuvre(d, feries)) d = lendemain(d);
  return d;
}

// Date du jour Jn (n ≥ 1) d'un projet ouvert en J1.
export function dateDuJour(j1: string, n: number, feries: Feries = AUCUN_FERIE): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Jour invalide : J${n}`);
  let d = premierJourOuvre(j1, feries);
  for (let i = 1; i < n; i++) d = premierJourOuvre(lendemain(d), feries);
  return d;
}

// Rang ouvré d'une date (J actuel du projet) : nombre de jours ouvrés de J1 à
// la date incluse ; 0 avant J1.
export function rangOuvre(j1: string, iso: string, feries: Feries = AUCUN_FERIE): number {
  let n = 0;
  for (let d = premierJourOuvre(j1, feries); d <= iso; d = premierJourOuvre(lendemain(d), feries)) n++;
  return n;
}

// Jours ouvrés strictement après `de`, jusqu'à `a` inclus (0 si a ≤ de).
export function joursOuvresApres(de: string, a: string, feries: Feries = AUCUN_FERIE): number {
  let n = 0;
  for (let d = lendemain(de); d <= a; d = lendemain(d)) if (estOuvre(d, feries)) n++;
  return n;
}

// Date du n-ième jour ouvré strictement après `de` (ex. relance possible
// 3 jours ouvrés après un dépôt).
export function apresJoursOuvres(de: string, n: number, feries: Feries = AUCUN_FERIE): string {
  let d = de;
  for (let k = 0; k < n;) {
    d = lendemain(d);
    if (estOuvre(d, feries)) k++;
  }
  return d;
}

// Écart de performance d'une tâche validée, en heures ouvrées : positif =
// avance (heures restant jusqu'à l'échéance incluse), négatif = retard.
export function ecartHeures(valideeLe: string, echeance: string, feries: Feries = AUCUN_FERIE): number {
  if (valideeLe <= echeance) return joursOuvresApres(valideeLe, echeance, feries) * HEURES_PAR_JOUR;
  return -joursOuvresApres(echeance, valideeLe, feries) * HEURES_PAR_JOUR;
}

// Retard d'une tâche non validée : jours calendaires depuis l'échéance.
export function joursDeRetard(echeance: string, aujourdhui: string): number {
  return Math.max(0, daysBetween(echeance, aujourdhui));
}
