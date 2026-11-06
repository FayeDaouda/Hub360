// Dates du HUB : jours au format ISO « AAAA-MM-JJ », affichage en français, au
// fuseau de Dakar (UTC+0 toute l'année, sans heure d'été), quel que soit le
// lieu de l'utilisateur ou du serveur (glossaire). Seul endroit où les dates
// sont calculées et formatées, au front comme au back. Exception : la
// salutation « Bonjour / Bonsoir » du front suit l'heure de l'appareil
// (moment de l'utilisateur, pas une donnée).

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
const jourMoisCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: 'short' });
const jourMoisLong = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: 'numeric', month: 'long' });
const jourSemaine = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const heureMinute = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' });
const dateHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, dateStyle: 'short', timeStyle: 'short' });
const dateHeureLongue = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, dateStyle: 'long', timeStyle: 'short' });

/** Jour ISO (AAAA-MM-JJ) d'un instant, à Dakar. */
export function toIsoDay(date: Date): string {
  return jourIsoDakar.format(date);
}

/** Jour ISO (AAAA-MM-JJ) d'aujourd'hui, à Dakar. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDay(now);
}

/** Année d'un instant, à Dakar (année courante par défaut). */
export function yearOf(date: Date = new Date()): number {
  return Number(toIsoDay(date).slice(0, 4));
}

/**
 * Mois (AAAA-MM) ou jour (AAAA-MM-JJ) décalé de `months` mois (négatif pour
 * reculer). Règle (glossaire) : si le jour n'existe pas dans le mois
 * d'arrivée, on prend le dernier jour de ce mois (31/01 + 1 mois → 28/02, ou
 * 29/02 une année bissextile).
 */
export function addMonths(value: string, months: number): string {
  const index = Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1 + months;
  const [year, month] = [Math.floor(index / 12), (index % 12) + 1];
  const monthIso = `${year}-${String(month).padStart(2, '0')}`;
  if (value.length < 10) return monthIso;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthIso}-${String(Math.min(Number(value.slice(8, 10)), lastDay)).padStart(2, '0')}`;
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

/** « 10/2026 » à partir d'un mois (AAAA-MM). */
export function formatNumericMonth(month: string): string {
  return month.split('-').reverse().join('/');
}

/** « 24 oct. ». */
export function formatDayShortMonth(iso: string): string {
  return jourMoisCourt.format(new Date(iso));
}

/** « 24 octobre ». */
export function formatDayLongMonth(iso: string): string {
  return jourMoisLong.format(new Date(iso));
}

/** « 18:40 ». */
/** « lundi 2 novembre » (Agenda). */
export function formatWeekdayDayMonth(iso: string): string {
  return jourSemaine.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return heureMinute.format(new Date(iso));
}

/** « 22/10/2026 18:40 ». */
export function formatDateTime(iso: string): string {
  return dateHeure.format(new Date(iso));
}

/** « 22 octobre 2026 à 18:40 ». */
export function formatLongDateTime(iso: string): string {
  return dateHeureLongue.format(new Date(iso));
}
