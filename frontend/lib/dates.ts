// Dates du HUB : jours au format ISO « AAAA-MM-JJ », affichage en français, au
// fuseau de Dakar (UTC+0 toute l'année, sans heure d'été). Seul endroit où
// les dates sont calculées et formatées côté front.

const FUSEAU = 'Africa/Dakar';
const JOUR_MS = 86_400_000;

const jourIsoDakar = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateLongue = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const moisAnnee = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const jourMoisCourt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

/** Jour ISO (AAAA-MM-JJ) d'un instant, à Dakar. */
export function toIsoDay(date: Date): string {
  return jourIsoDakar.format(date);
}

/** Jour ISO (AAAA-MM-JJ) d'aujourd'hui, à Dakar. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDay(now);
}

/** Jour ISO décalé de `days` jours (négatif pour reculer). */
export function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`) + days * JOUR_MS).toISOString().slice(0, 10);
}

/** Jours calendaires de `from` à `to` (jours ou instants ISO, heure ignorée). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / JOUR_MS,
  );
}

/** Jours entiers écoulés depuis `since` (négatif s'il est à venir). */
export function daysSince(since: string | Date, now: number = Date.now()): number {
  const debut = typeof since === 'string' ? Date.parse(since) : since.getTime();
  return Math.floor((now - debut) / JOUR_MS);
}

/** « 24/10/2026 » à partir d'un jour ou d'un instant ISO ; `fallback` si absent. */
export function formatDate(iso: string | null | undefined, fallback = '—'): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : fallback;
}

/** « 24/10 » à partir d'un jour ou d'un instant ISO ; `fallback` si absent. */
export function formatDayMonth(iso: string | null | undefined, fallback = '—'): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : fallback;
}

/** « 24 octobre 2026 ». */
export function formatLongDate(iso: string): string {
  return dateLongue.format(new Date(iso));
}

/** « octobre 2026 » à partir d'un mois (AAAA-MM) ou d'un jour ISO. */
export function formatMonthYear(monthOrDay: string): string {
  return moisAnnee.format(new Date(`${monthOrDay.slice(0, 7)}-15T12:00:00Z`));
}

/** « 24 oct. », au fuseau de l'appareil (affichage d'un instant). */
export function formatDayShortMonth(iso: string): string {
  return jourMoisCourt.format(new Date(iso));
}
