import { addDays, addMonths, formatWeekdayDayMonth, toIsoDay } from '@hub/domain';
import type { CategorieAudit, LigneAudit } from '@/lib/pilotage';

// Journal d'audit (refonte du 08/11/2026, lot 4 de l'Administration du HUB) :
// période, filtres et regroupement par jour. Tout se fait sur les traces déjà
// chargées, sauf la période, qui est demandée au serveur (un an au plus).

export const CATEGORY_LABELS: Record<CategorieAudit, string> = {
  comptes: 'Comptes',
  droits: 'Droits',
  finances: 'Finances',
  reglages: 'Réglages',
  rh: 'Départs',
  // Qui a consulté ou modifié le salaire ou un bulletin de qui (jamais de montant).
  paie: 'Paie',
  pilotage: 'Reportings',
  // Interventions de l'Administration du HUB (bascules, déblocages, avec motif).
  administration: 'Administration',
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as CategorieAudit[];

export type JournalPeriod = '7j' | '30j' | '3m' | '12m' | 'perso';
export const PERIOD_LABELS: Record<JournalPeriod, string> = {
  '7j': '7 jours',
  '30j': '30 jours',
  '3m': '3 mois',
  '12m': '12 mois',
  perso: 'Dates…',
};
export const PERIODS = Object.keys(PERIOD_LABELS) as JournalPeriod[];

// Traces sans auteur (faites par le HUB lui-même : verrouillage, relances…).
export const SYSTEM_AUTHOR = 'le HUB';

export type JournalCriteria = {
  period: JournalPeriod;
  // Dates choisies (période « perso » seulement), AAAA-MM-JJ.
  from: string;
  to: string;
  category: CategorieAudit | 'toutes';
  // Nom de l'auteur, SYSTEM_AUTHOR pour le HUB, '' pour tout le monde.
  author: string;
  search: string;
};

// 30 jours : la période que le serveur lit sans dates.
export const DEFAULT_CRITERIA: JournalCriteria = {
  period: '30j',
  from: '',
  to: '',
  category: 'toutes',
  author: '',
  search: '',
};

// Plafond du serveur (backend/src/audit/journal-audit.service.ts, JOURS_MAX).
const MAX_DAYS = 366;

/** Bornes incluses (AAAA-MM-JJ) d'une période, à la date du jour (Dakar). */
export function periodRange(
  c: Pick<JournalCriteria, 'period' | 'from' | 'to'>,
  today: string,
): { from: string; to: string } {
  switch (c.period) {
    case '7j':
      return { from: addDays(today, -6), to: today };
    case '30j':
      return { from: addDays(today, -29), to: today };
    case '3m':
      return { from: addDays(addMonths(today, -3), 1), to: today };
    case '12m':
      return { from: addDays(today, -364), to: today };
    case 'perso':
      return { from: c.from, to: c.to };
  }
}

// Jour qui existe vraiment (« 2026-02-30 » ou « 2026-13-01 » refusés).
const isRealDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/** Ce qui empêche de lire la période, dit avant de la demander au serveur. */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) return 'Choisissez une date de début et une date de fin.';
  if (!isRealDay(from) || !isRealDay(to)) return 'Cette date n’existe pas : vérifiez le jour et le mois.';
  if (from > to) return 'La date de début doit précéder la date de fin.';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_DAYS) return 'Un an au plus par consultation : rapprochez les deux dates.';
  return null;
}

const isCategory = (v: string | null): v is CategorieAudit => !!v && Object.hasOwn(CATEGORY_LABELS, v);
const isPeriod = (v: string | null): v is JournalPeriod => !!v && Object.hasOwn(PERIOD_LABELS, v);

// Paramètres de l'adresse : un lien filtré se partage, un retour sur l'onglet
// le retrouve. La recherche (texte libre, frappe par frappe) n'y est pas : elle
// ne finirait ni dans l'historique ni dans les journaux du serveur.
const PARAMS = { period: 'periode', from: 'du', to: 'au', category: 'categorie', author: 'par' } as const;

/** Critères lus dans l'adresse ; une valeur inconnue reprend la valeur par défaut. */
export function readCriteria(params: URLSearchParams): JournalCriteria {
  const from = params.get(PARAMS.from) ?? '';
  const to = params.get(PARAMS.to) ?? '';
  const period = params.get(PARAMS.period);
  const category = params.get(PARAMS.category);
  return {
    period: isPeriod(period) ? period : DEFAULT_CRITERIA.period,
    from: isRealDay(from) ? from : '',
    to: isRealDay(to) ? to : '',
    category: isCategory(category) ? category : 'toutes',
    author: params.get(PARAMS.author) ?? '',
    search: '',
  };
}

/**
 * Adresse avec ces critères : les autres paramètres (onglet…) sont gardés,
 * les valeurs par défaut omises.
 */
export function writeCriteria(params: URLSearchParams, c: JournalCriteria): URLSearchParams {
  const next = new URLSearchParams(params);
  const values: Record<keyof typeof PARAMS, string> = {
    period: c.period === DEFAULT_CRITERIA.period ? '' : c.period,
    from: c.period === 'perso' ? c.from : '',
    to: c.period === 'perso' ? c.to : '',
    category: c.category === 'toutes' ? '' : c.category,
    author: c.author,
  };
  // Ancien paramètre de recherche (lien d'avant le 08/11) : retiré.
  next.delete('q');
  for (const key of Object.keys(PARAMS) as (keyof typeof PARAMS)[]) {
    if (values[key]) next.set(PARAMS[key], values[key]);
    else next.delete(PARAMS[key]);
  }
  return next;
}

/** Un filtre au moins s'écarte du réglage par défaut (la période n'en est pas un). */
export const hasActiveFilters = (c: JournalCriteria): boolean =>
  c.category !== 'toutes' || c.author !== '' || c.search.trim() !== '';

const authorOf = (l: LigneAudit) => l.par ?? SYSTEM_AUTHOR;

/** Auteurs présents dans les traces, par ordre alphabétique (le HUB en dernier). */
export function authorsOf(lines: LigneAudit[]): string[] {
  const names = [...new Set(lines.map((l) => l.par).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  return lines.some((l) => !l.par) ? [...names, SYSTEM_AUTHOR] : names;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Traces de l'auteur choisi qui contiennent le texte cherché (action, détail, auteur, catégorie). */
export function matchAuthorAndSearch(lines: LigneAudit[], c: JournalCriteria): LigneAudit[] {
  const term = normalize(c.search.trim());
  return lines.filter(
    (l) =>
      (!c.author || authorOf(l) === c.author) &&
      (!term || normalize(`${l.action} ${l.detail} ${authorOf(l)} ${CATEGORY_LABELS[l.categorie]}`).includes(term)),
  );
}

/** Traces affichées : auteur, texte, puis catégorie. */
export function filterLines(lines: LigneAudit[], c: JournalCriteria): LigneAudit[] {
  return matchAuthorAndSearch(lines, c).filter((l) => c.category === 'toutes' || l.categorie === c.category);
}

/** Nombre de traces par catégorie (pastilles), parmi celles de l'auteur et du texte choisis. */
export function countByCategory(lines: LigneAudit[]): Record<CategorieAudit, number> {
  const counts = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<CategorieAudit, number>;
  for (const l of lines) counts[l.categorie] += 1;
  return counts;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Aujourd’hui · samedi 7 novembre », « Hier · … », « Jeudi 5 novembre », « … 2025 » une autre année. */
export function dayTitle(day: string, today: string): string {
  const label = formatWeekdayDayMonth(`${day}T12:00:00Z`);
  const year = day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`;
  if (day === today) return `Aujourd’hui · ${label}`;
  if (day === addDays(today, -1)) return `Hier · ${label}`;
  return `${capitalize(label)}${year}`;
}

export type JournalDay = { day: string; title: string; lines: LigneAudit[] };

/** Traces regroupées par jour (heure de Dakar), dans l'ordre reçu (du plus récent au plus ancien). */
export function groupByDay(lines: LigneAudit[], today: string): JournalDay[] {
  const days: JournalDay[] = [];
  for (const l of lines) {
    const day = toIsoDay(new Date(l.le));
    const last = days[days.length - 1];
    if (last?.day === day) last.lines.push(l);
    else days.push({ day, title: dayTitle(day, today), lines: [l] });
  }
  return days;
}

/**
 * Le motif d'une intervention, mis à part du détail (« crm · CRM désactivé ·
 * motif : audit » → détail « crm · CRM désactivé », motif « audit »).
 */
const MOTIF = 'motif : ';

export function splitMotif(detail: string): { detail: string; motif: string | null } {
  // Le motif, saisi librement, vient toujours en dernier : sa marque est la
  // première « motif : » en tête du détail ou juste après un « · ».
  const after = detail.indexOf(` · ${MOTIF}`);
  const at = detail.startsWith(MOTIF) ? 0 : after >= 0 ? after + 3 : -1;
  if (at < 0) return { detail, motif: null };
  return { detail: at > 0 ? detail.slice(0, at - 3) : '', motif: detail.slice(at + MOTIF.length) || null };
}
