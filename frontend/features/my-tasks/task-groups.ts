import { AlarmClock, AtSign, CalendarClock, Hourglass, RotateCcw, type LucideIcon } from 'lucide-react';
import { addDays, daysBetween } from '@hub/domain';
import type { MyTask } from './types';

// Classement de « Mes tâches » par urgence (logique et mots revus le
// 23/10/2026). Le retard est un attribut, pas une catégorie : une tâche à
// reprendre dont l'échéance est passée compte aussi « En retard ». Les cartes
// se recoupent donc ; la liste, elle, montre chaque tâche une seule fois, à sa
// place la plus urgente. Le retard et la date qui fait foi viennent du back
// (enRetard, dateEffective).

export type Filter = 'reprises' | 'retards' | 'semaine' | 'attente' | 'mentions';
export type Section = Exclude<Filter, 'mentions'>;
// Ton de couleur (tokens --pill-*) : bande de la ligne, compteur du filtre.
export type Tone = 'risque' | 'attention' | 'info' | 'iris' | 'neutre';

export const FILTERS: { key: Filter; label: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  { key: 'retards', label: 'En retard', hint: 'échéance dépassée', icon: AlarmClock, tone: 'risque' },
  { key: 'reprises', label: 'À reprendre', hint: 'renvoyées par votre N+1', icon: RotateCcw, tone: 'risque' },
  { key: 'semaine', label: 'Cette semaine', hint: 'à rendre d’ici dimanche', icon: CalendarClock, tone: 'attention' },
  { key: 'attente', label: 'En validation', hint: 'déposées chez votre N+1', icon: Hourglass, tone: 'info' },
  { key: 'mentions', label: 'Mentions', hint: 'à lire dans les fils', icon: AtSign, tone: 'iris' },
];

// Ce qu'une carte vide dit de bien (un « 0 » gris ressemblait à une erreur).
export const EMPTY_LABELS: Record<Filter, string> = {
  retards: 'aucun retard',
  reprises: 'rien à reprendre',
  semaine: 'rien d’ici dimanche',
  attente: 'rien en attente',
  mentions: 'tout est lu',
};

// Ordre d'urgence des sections (et des cartes).
export const SECTIONS: Section[] = ['retards', 'reprises', 'semaine', 'attente'];
export const SECTION_TITLES: Record<Section, string> = {
  retards: 'En retard',
  reprises: 'À reprendre',
  semaine: 'À rendre cette semaine',
  attente: 'En attente de validation',
};

const byDue = (a: MyTask, b: MyTask) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999');
// Date qui fait foi pour l'urgence : la date accordée d'une tâche prolongée.
export const byEffectiveDue = (a: MyTask, b: MyTask) =>
  (a.dateEffective ?? '9999').localeCompare(b.dateEffective ?? '9999');
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// Échéance lue d'un coup d'œil : « 14 j de retard », « Aujourd’hui », « Dans 3 j ».
export function relativeDue(due: string, today: string): string {
  const n = daysBetween(today, due);
  if (n < 0) return `${-n} j de retard`;
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  return `Dans ${n} j`;
}

// « déposée il y a 4 j » : depuis quand le N+1 a la tâche entre les mains.
export function waitingSince(submittedAt: string, today: string): string {
  const n = daysBetween(submittedAt.slice(0, 10), today);
  if (n <= 0) return 'déposée aujourd’hui';
  if (n === 1) return 'déposée hier';
  return `déposée il y a ${n} j`;
}

export type TaskGroups = ReturnType<typeof groupTasks>;

// `sending` : dépôts en attente d'envoi (délai d'annulation), déjà « en
// validation » à l'écran — ni en retard, et leur échéance fait foi.
export function groupTasks(tasks: MyTask[], today: string, sending: string[]) {
  const shown = tasks.map((t) =>
    sending.includes(t.id)
      ? {
          ...t,
          statut: 'remise' as const,
          version: t.version + 1,
          remisLe: today,
          renvoiMotif: null,
          enRetard: false,
          dateEffective: t.echeance,
        }
      : t,
  );
  const open = shown.filter((t) => t.statut !== 'validee').sort(byDue);
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const sunday = addDays(monday, 6);
  // En retard, du plus ancien au plus récent.
  const retards = open.filter((t) => t.enRetard).sort(byEffectiveDue);
  const late = new Set(retards);
  const reprises = open.filter((t) => t.statut === 'a_reprendre');
  const semaine = open
    .filter(
      (t) =>
        !late.has(t) &&
        (t.statut === 'en_cours' || t.statut === 'a_venir' || t.statut === 'prolongee') &&
        !!t.dateEffective &&
        t.dateEffective <= sunday,
    )
    .sort(byEffectiveDue);
  const attente = open.filter((t) => t.statut === 'remise');
  // Sections de la vue par urgence : chaque tâche une fois, à sa place la
  // plus urgente (une reprise en retard est dans « En retard »).
  const sections: Record<Section, MyTask[]> = {
    retards,
    reprises: reprises.filter((t) => !late.has(t)),
    semaine,
    attente,
  };
  const classified = new Set([...retards, ...reprises, ...semaine, ...attente]);
  const later = open.filter((t) => !classified.has(t));
  // Ton d'une tâche, quelle que soit la vue : la bande de sa ligne.
  const toneOf = (t: MyTask): Tone =>
    late.has(t) || t.statut === 'a_reprendre'
      ? 'risque'
      : semaine.includes(t)
        ? 'attention'
        : attente.includes(t)
          ? 'info'
          : 'neutre';
  // Ordre d'urgence (vue par projet) : retard, reprise, semaine, validation, le reste.
  const rank = (t: MyTask) => {
    const i = SECTIONS.findIndex((key) => sections[key].includes(t));
    return i < 0 ? SECTIONS.length : i;
  };
  // Tâches qui demandent une action (sans double compte).
  const urgent = new Set([...retards, ...reprises, ...semaine]).size;
  return { open, retards, reprises, semaine, attente, sections, later, sunday, late, toneOf, rank, urgent };
}

// Vue par projet : un groupe par projet, les plus urgents d'abord.
export function groupByProject(tasks: MyTask[], rank: (t: MyTask) => number) {
  const byId = new Map<string, { projetId: string; code: string; client: string; tasks: MyTask[] }>();
  for (const t of tasks) {
    const p = byId.get(t.projetId) ?? { projetId: t.projetId, code: t.projetCode, client: t.projetClient, tasks: [] };
    p.tasks.push(t);
    byId.set(t.projetId, p);
  }
  const groups = [...byId.values()];
  for (const p of groups) p.tasks.sort((a, b) => rank(a) - rank(b) || byEffectiveDue(a, b));
  return groups.sort((a, b) => rank(a.tasks[0]) - rank(b.tasks[0]) || byEffectiveDue(a.tasks[0], b.tasks[0]));
}
