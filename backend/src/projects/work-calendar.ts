import { AUCUN_FERIE, HEURES_PAR_JOUR, type Feries } from '../rh/regles-temps';
import { addDays, daysBetween } from '@hub/domain';

// Calendrier ouvrable d'un projet ouvert selon le gabarit : J1 = jour
// d'ouverture (émission de F1) ou le premier jour ouvré qui suit ; Jn = n-ième
// jour ouvré (lundi → vendredi, hors jours fériés des Réglages). Fonctions
// pures, dates AAAA-MM-JJ.

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const nextDay = (iso: string) => addDays(iso, 1);

export function isWorkday(iso: string, holidays: Feries = AUCUN_FERIE): boolean {
  const weekday = toDate(iso).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(iso);
}

export function firstWorkday(iso: string, holidays: Feries = AUCUN_FERIE): string {
  let d = iso;
  while (!isWorkday(d, holidays)) d = nextDay(d);
  return d;
}

// Date du jour Jn (n ≥ 1) d'un projet ouvert en J1.
export function dateOfDay(day1: string, n: number, holidays: Feries = AUCUN_FERIE): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Jour invalide : J${n}`);
  let d = firstWorkday(day1, holidays);
  for (let i = 1; i < n; i++) d = firstWorkday(nextDay(d), holidays);
  return d;
}

// Rang ouvré d'une date (J actuel du projet) : nombre de jours ouvrés de J1 à
// la date incluse ; 0 avant J1.
export function workdayRank(day1: string, iso: string, holidays: Feries = AUCUN_FERIE): number {
  let n = 0;
  for (let d = firstWorkday(day1, holidays); d <= iso; d = firstWorkday(nextDay(d), holidays)) n++;
  return n;
}

// Jours ouvrés strictement après `from`, jusqu'à `to` inclus (0 si to ≤ from).
export function workdaysAfter(from: string, to: string, holidays: Feries = AUCUN_FERIE): number {
  let n = 0;
  for (let d = nextDay(from); d <= to; d = nextDay(d)) if (isWorkday(d, holidays)) n++;
  return n;
}

// Date du n-ième jour ouvré strictement après `from` (ex. relance possible
// 3 jours ouvrés après un dépôt).
export function addWorkdays(from: string, n: number, holidays: Feries = AUCUN_FERIE): string {
  let d = from;
  for (let k = 0; k < n;) {
    d = nextDay(d);
    if (isWorkday(d, holidays)) k++;
  }
  return d;
}

// Écart de performance d'une tâche validée, en heures ouvrées : positif =
// avance (heures restant jusqu'à l'échéance incluse), négatif = retard.
export function hoursGap(validatedOn: string, due: string, holidays: Feries = AUCUN_FERIE): number {
  if (validatedOn <= due) return workdaysAfter(validatedOn, due, holidays) * HEURES_PAR_JOUR;
  return -workdaysAfter(due, validatedOn, holidays) * HEURES_PAR_JOUR;
}

// Retard d'une tâche non validée : jours calendaires depuis l'échéance.
export function daysLate(due: string, today: string): number {
  return Math.max(0, daysBetween(due, today));
}
