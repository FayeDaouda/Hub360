// Rendez-vous récurrents de l'Agenda (16/11/2026) : la règle de répétition au
// format des agendas (RRULE, RFC 5545 §3.3.10), dans le sous-ensemble que
// proposent Google Agenda et Outlook — chaque jour, chaque semaine (jours au
// choix), chaque mois (même date ou « 2e jeudi », « dernier vendredi »),
// chaque année ; un intervalle ; une fin à une date ou après N fois. Seul
// endroit où la règle est lue, écrite, déroulée et décrite, au serveur comme
// à l'écran. Heure de Dakar = UTC toute l'année : aucun changement d'heure.

import { formatLongDate } from './dates';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Recurrence = {
  freq: Frequency;
  interval: number; // 1 = chaque, 2 = toutes les deux…
  // Hebdomadaire : les jours de la semaine (sinon celui du début).
  byDay?: Weekday[];
  // Mensuelle « le 2e jeudi » (rang 1 à 4, ou -1 : le dernier).
  nthDay?: { nth: number; day: Weekday };
  // Fin : le dernier jour possible (AAAA-MM-JJ, inclus) ou un nombre de fois.
  until?: string;
  count?: number;
};

// Bornes : de quoi couvrir des années de réunions, jamais une boucle sans fin.
export const RECURRENCE_MAX_INTERVAL = 99;
export const RECURRENCE_MAX_COUNT = 730;
const MAX_ITERATIONS = 20_000;

const DAY_MS = 86_400_000;
const NOMS_JOURS: Record<Weekday, string> = {
  MO: 'lundi',
  TU: 'mardi',
  WE: 'mercredi',
  TH: 'jeudi',
  FR: 'vendredi',
  SA: 'samedi',
  SU: 'dimanche',
};
const RANGS: Record<string, string> = { '1': '1er', '2': '2e', '3': '3e', '4': '4e', '-1': 'dernier' };

// Jour de la semaine (MO…SU) d'un instant ou d'un jour.
export const weekdayOf = (iso: string): Weekday =>
  WEEKDAYS[(new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7];

// Rang du jour dans son mois : « 2e jeudi », ou -1 s'il est le dernier.
export function nthOf(iso: string): { nth: number; day: Weekday; last: boolean } {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const nth = Math.ceil(d.getUTCDate() / 7);
  const last = d.getUTCDate() + 7 > daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  return { nth, day: weekdayOf(iso), last };
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// Le jour (1-31) du « n-ième <jour> » d'un mois, ou null s'il n'existe pas.
function nthWeekdayOfMonth(year: number, month0: number, nth: number, day: Weekday): number | null {
  const cible = WEEKDAYS.indexOf(day);
  const total = daysInMonth(year, month0);
  if (nth === -1) {
    const dernier = (new Date(Date.UTC(year, month0, total)).getUTCDay() + 6) % 7;
    return total - ((dernier - cible + 7) % 7);
  }
  const premier = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
  const jour = 1 + ((cible - premier + 7) % 7) + (nth - 1) * 7;
  return jour <= total ? jour : null;
}

const DATE_RRULE = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/;

// Lit une règle « FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20270101T235959Z ».
// Toute partie hors du sous-ensemble est refusée (jamais ignorée en silence).
export function parseRRule(rrule: string): Recurrence {
  const parts = new Map<string, string>();
  for (const morceau of rrule.replace(/^RRULE:/i, '').split(';')) {
    if (!morceau) continue;
    const [cle, valeur] = morceau.split('=');
    if (!cle || valeur === undefined || parts.has(cle.toUpperCase())) throw new Error(`Règle illisible : ${rrule}`);
    parts.set(cle.toUpperCase(), valeur.toUpperCase());
  }
  const freq = parts.get('FREQ') as Frequency | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) throw new Error('Fréquence inconnue.');
  for (const cle of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST'].includes(cle)) {
      throw new Error(`Partie de règle non prise en charge : ${cle}`);
    }
  }
  // Semaines du lundi seulement (celles que déroule ce module).
  if (parts.has('WKST') && parts.get('WKST') !== 'MO') throw new Error('Semaine du lundi seulement (WKST=MO).');
  const r: Recurrence = { freq, interval: 1 };
  const intervalle = parts.get('INTERVAL');
  if (intervalle !== undefined) {
    r.interval = Number(intervalle);
    if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > RECURRENCE_MAX_INTERVAL) {
      throw new Error('Intervalle invalide.');
    }
  }
  const byDay = parts.get('BYDAY');
  if (byDay) {
    if (freq === 'WEEKLY') {
      const jours = byDay.split(',');
      if (!jours.every((j): j is Weekday => (WEEKDAYS as readonly string[]).includes(j))) {
        throw new Error('Jours invalides.');
      }
      r.byDay = WEEKDAYS.filter((j) => jours.includes(j));
    } else if (freq === 'MONTHLY') {
      const m = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.exec(byDay);
      if (!m) throw new Error('Rang de jour invalide.');
      r.nthDay = { nth: Number(m[1]), day: m[2] as Weekday };
    } else {
      throw new Error('BYDAY non pris en charge pour cette fréquence.');
    }
  }
  const until = parts.get('UNTIL');
  const count = parts.get('COUNT');
  if (until && count) throw new Error('UNTIL et COUNT ensemble.');
  if (until) {
    const m = DATE_RRULE.exec(until);
    if (!m) throw new Error('Date de fin invalide.');
    r.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (count) {
    r.count = Number(count);
    if (!Number.isInteger(r.count) || r.count < 1 || r.count > RECURRENCE_MAX_COUNT) {
      throw new Error('Nombre de fois invalide.');
    }
  }
  return r;
}

// Écrit la règle (UNTIL en fin de journée, UTC = Dakar).
export function formatRRule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'WEEKLY' && r.byDay?.length) parts.push(`BYDAY=${r.byDay.join(',')}`);
  if (r.freq === 'MONTHLY' && r.nthDay) parts.push(`BYDAY=${r.nthDay.nth}${r.nthDay.day}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

// Déroule les occurrences : leurs débuts (ISO), dans [du, au[, dans l'ordre.
// Le compte (COUNT) part toujours du premier rendez-vous, même avant `du`.
export function expandOccurrences(
  r: Recurrence,
  startIso: string,
  window: { from: string; to: string },
  max = 1000,
): string[] {
  const start = new Date(startIso);
  const heure = start.getTime() - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const fin = Date.parse(window.to);
  const debutFenetre = Date.parse(window.from);
  const limite = r.until ? Date.parse(`${r.until}T23:59:59.999Z`) : Infinity;
  const resultat: string[] = [];
  let compte = 0;
  let tours = 0;

  // Émet un candidat (jour UTC à minuit + heure du premier rendez-vous) ;
  // false : on s'arrête.
  const emettre = (jourMs: number): boolean => {
    const t = jourMs + heure;
    if (t < start.getTime()) return true;
    if (t > limite || t >= fin) return false;
    compte++;
    if (r.count && compte > r.count) return false;
    if (t >= debutFenetre) resultat.push(new Date(t).toISOString());
    return resultat.length < max;
  };
  const jour0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());

  if (r.freq === 'DAILY') {
    for (let k = 0; tours++ < MAX_ITERATIONS; k++) if (!emettre(jour0 + k * r.interval * DAY_MS)) break;
  } else if (r.freq === 'WEEKLY') {
    const jours = (r.byDay?.length ? r.byDay : [weekdayOf(startIso)]).map((j) => WEEKDAYS.indexOf(j));
    const lundi0 = jour0 - ((start.getUTCDay() + 6) % 7) * DAY_MS;
    let continuer = true;
    for (let k = 0; continuer && tours++ < MAX_ITERATIONS; k++) {
      const lundi = lundi0 + k * r.interval * 7 * DAY_MS;
      for (const j of jours) {
        if (!emettre(lundi + j * DAY_MS)) {
          continuer = false;
          break;
        }
      }
    }
  } else {
    const pas = r.freq === 'MONTHLY' ? r.interval : r.interval * 12;
    const an0 = start.getUTCFullYear();
    const mois0 = start.getUTCMonth();
    const date0 = start.getUTCDate();
    for (let k = 0; tours++ < MAX_ITERATIONS; k++) {
      const index = mois0 + k * pas;
      const an = an0 + Math.floor(index / 12);
      const mois = ((index % 12) + 12) % 12;
      const jour = r.nthDay ? nthWeekdayOfMonth(an, mois, r.nthDay.nth, r.nthDay.day) : date0;
      // Un mois sans ce jour (31, 29 février, 5e jeudi) est sauté (RFC 5545).
      if (jour === null || jour > daysInMonth(an, mois)) {
        if (Date.UTC(an, mois, 1) >= fin || Date.UTC(an, mois, 1) > limite) break;
        continue;
      }
      if (!emettre(Date.UTC(an, mois, jour))) break;
    }
  }
  return resultat;
}

// « Chaque semaine le lundi et le mercredi, jusqu'au 1 janvier 2027 ».
export function describeRecurrence(r: Recurrence, startIso: string): string {
  const liste = (mots: string[]) =>
    mots.length <= 1 ? (mots[0] ?? '') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
  let texte: string;
  const tous = (unite: string, pluriel: string) =>
    r.interval === 1 ? `Chaque ${unite}` : `Tous les ${r.interval} ${pluriel}`;
  if (r.freq === 'DAILY') texte = r.interval === 1 ? 'Chaque jour' : `Tous les ${r.interval} jours`;
  else if (r.freq === 'WEEKLY') {
    const jours = r.byDay?.length ? r.byDay : [weekdayOf(startIso)];
    const ouvres = jours.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((j) => jours.includes(j as Weekday));
    if (ouvres && r.interval === 1) texte = 'Chaque jour ouvré (du lundi au vendredi)';
    else
      texte = `${r.interval === 1 ? 'Chaque semaine' : `Toutes les ${r.interval} semaines`} le ${liste(jours.map((j) => NOMS_JOURS[j]))}`;
  } else if (r.freq === 'MONTHLY') {
    const quand = r.nthDay
      ? `le ${RANGS[String(r.nthDay.nth)]} ${NOMS_JOURS[r.nthDay.day]}`
      : `le ${Number(startIso.slice(8, 10))}`;
    texte = `${tous('mois', 'mois')} ${quand}`;
  } else {
    texte = `${tous('année', 'ans')} le ${formatLongDate(`${startIso.slice(0, 10)}T12:00:00Z`).replace(/ \d{4}$/, '')}`;
  }
  if (r.until) texte += `, jusqu’au ${formatLongDate(`${r.until}T12:00:00Z`)}`;
  else if (r.count) texte += `, ${r.count} fois`;
  return texte;
}

// Les choix du formulaire, comme Google Agenda, pour un premier rendez-vous
// donné : le libellé s'adapte à sa date.
export function recurrencePresets(startIso: string): { key: string; label: string; recurrence: Recurrence }[] {
  const jour = weekdayOf(startIso);
  const { nth, last } = nthOf(startIso);
  const presets: { key: string; recurrence: Recurrence }[] = [
    { key: 'daily', recurrence: { freq: 'DAILY', interval: 1 } },
    { key: 'weekdays', recurrence: { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] } },
    { key: 'weekly', recurrence: { freq: 'WEEKLY', interval: 1, byDay: [jour] } },
    { key: 'biweekly', recurrence: { freq: 'WEEKLY', interval: 2, byDay: [jour] } },
    { key: 'monthly-date', recurrence: { freq: 'MONTHLY', interval: 1 } },
    ...(nth <= 4
      ? [{ key: 'monthly-nth', recurrence: { freq: 'MONTHLY' as const, interval: 1, nthDay: { nth, day: jour } } }]
      : []),
    ...(last
      ? [{ key: 'monthly-last', recurrence: { freq: 'MONTHLY' as const, interval: 1, nthDay: { nth: -1, day: jour } } }]
      : []),
    { key: 'yearly', recurrence: { freq: 'YEARLY', interval: 1 } },
  ];
  return presets.map((p) => ({ ...p, label: describeRecurrence(p.recurrence, startIso) }));
}

// Le premier rendez-vous tombe-t-il sur la règle ? La RFC 5545 le compte
// toujours comme première occurrence : une règle qui ne le donnerait pas
// (« chaque lundi » commencé un mardi) s'afficherait autrement chez Google ou
// Outlook. Le HUB n'enregistre donc que des règles alignées sur leur début.
export function isRecurrenceStart(r: Recurrence, startIso: string): boolean {
  const debut = new Date(startIso).toISOString();
  return (
    expandOccurrences(r, debut, { from: debut, to: new Date(Date.parse(debut) + 1).toISOString() }, 1)[0] === debut
  );
}

// Recale une règle sur un nouveau premier rendez-vous, comme Google Agenda :
// « chaque semaine le mardi » déplacé un jeudi devient « le jeudi » (avec
// plusieurs jours, le nouveau jour s'ajoute) ; « le 2e mardi » devient le
// rang du nouveau jour (« le dernier » s'il n'a pas de 5e). Les autres
// règles suivent déjà la date du début.
export function alignRecurrence(r: Recurrence, startIso: string): Recurrence {
  if (isRecurrenceStart(r, startIso)) return r;
  const jour = weekdayOf(startIso);
  if (r.freq === 'WEEKLY') {
    const jours = r.byDay ?? [];
    const suivants = jours.length > 1 ? [...jours, jour] : [jour];
    return { ...r, byDay: WEEKDAYS.filter((j) => suivants.includes(j)) };
  }
  if (r.freq === 'MONTHLY' && r.nthDay) {
    const { nth, last } = nthOf(startIso);
    return { ...r, nthDay: { nth: r.nthDay.nth === -1 || nth > 4 ? (last ? -1 : nth) : nth, day: jour } };
  }
  return r;
}

// Décale les jours d'une règle de `jours` jours (glisser toute une série, ou
// changer sa date) : « lundi et mercredi » décalé d'un jour devient « mardi
// et jeudi » ; « le 2e mardi » devient « le 2e mercredi ». Les autres règles
// suivent déjà la date du début.
export function shiftRecurrence(r: Recurrence, jours: number): Recurrence {
  const d = ((Math.round(jours) % 7) + 7) % 7;
  if (!d) return r;
  const decale = (j: Weekday) => WEEKDAYS[(WEEKDAYS.indexOf(j) + d) % 7];
  if (r.freq === 'WEEKLY' && r.byDay?.length) {
    const jours2 = r.byDay.map(decale);
    return { ...r, byDay: WEEKDAYS.filter((j) => jours2.includes(j)) };
  }
  if (r.freq === 'MONTHLY' && r.nthDay) return { ...r, nthDay: { ...r.nthDay, day: decale(r.nthDay.day) } };
  return r;
}
