import type { Feries } from '../rh/regles-temps';
import { daysLate, hoursGap } from './work-calendar';

// États affichés d'un projet ouvert selon le gabarit (maquette « Projets ») —
// dérivés des dates figées et du statut enregistré, jamais stockés. Pures.

export type TaskStatus = 'a_faire' | 'a_valider' | 'reprise' | 'validee' | 'non_necessaire';

export type TaskSource = {
  cle: string;
  libelle: string;
  statut: TaskStatus;
  debutLe: string | null;
  finLe: string | null;
  version: number;
  valideeLe: string | null; // AAAA-MM-JJ
  // Prolongation accordée : le retard est qualifié jusqu'à cette date ;
  // l'échéance de référence (finLe) reste figée.
  prolongeeJusquau?: string | null;
  // Visa DPLG (revue Dir. GC, 21/10/2026) : exigé, et apposé le… (AAAA-MM-JJ).
  visaRequis?: boolean;
  viseeLe?: string | null;
  visaNonTrace?: boolean; // validée avant la règle du visa : ni bloquée ni visée
};

export type CardSource = {
  cle: string;
  etapeNumero: number;
  etapeCle: string;
  fichiers: boolean;
  desactivation: string | null;
  ouvreApres: string[];
  taches: TaskSource[];
};

export type TaskState =
  | { code: 'desactivee' }
  | { code: 'non_necessaire' }
  | { code: 'verrouillee' }
  | { code: 'validee'; ecart: number | null } // heures : + avance, − retard
  | { code: 'a_viser' } // validée par le chef de team, visa DPLG à apposer
  | { code: 'a_valider'; version: number }
  // jours : retard d'une reprise dont l'échéance effective (délai accordé,
  // sinon de référence) est passée ; null dans les délais.
  | { code: 'reprise'; version: number; jours: number | null }
  | { code: 'en_retard'; jours: number }
  | { code: 'prolongee'; jusquau: string; jours: number } // retard qualifié (jours depuis la référence)
  | { code: 'en_cours' }
  | { code: 'a_venir' };

export type CardState =
  | { code: 'desactivee'; motif: string }
  | { code: 'rubriques' }
  | { code: 'verrouillee'; attend: string[] } // libellés des tâches attendues
  | { code: 'close'; le: string | null }
  | { code: 'ouverte' };

export type StepState = 'en_retard' | 'en_cours' | 'a_venir' | 'terminee';

export type StepSummary = { numero: number; faites: number; total: number; enRetard: number; etat: StepState };

// Faite : non nécessaire, ou validée — et visée quand le visa DPLG est exigé.
export const awaitsVisa = (t: TaskSource) => t.statut === 'validee' && !!t.visaRequis && !t.viseeLe && !t.visaNonTrace;
const isDone = (t: TaskSource) => t.statut === 'non_necessaire' || (t.statut === 'validee' && !awaitsVisa(t));

// Le dépôt du permis attend les plans visés : une tâche « depot » reste
// verrouillée tant qu'une tâche de sa carte attend son visa DPLG.
export const depositAwaitsVisa = (t: TaskSource, card: CardSource) => t.cle === 'depot' && card.taches.some(awaitsVisa);

// Tâches dont dépend l'ouverture d'une carte, non encore faites.
function pendingPrerequisites(card: CardSource, allTasks: Map<string, TaskSource>): TaskSource[] {
  return card.ouvreApres.map((ref) => allTasks.get(ref)).filter((t): t is TaskSource => !!t && !isDone(t));
}

export function indexTasks(cards: CardSource[]): Map<string, TaskSource> {
  return new Map(cards.flatMap((c) => c.taches.map((t) => [`${c.cle}.${t.cle}`, t] as const)));
}

export function cardState(card: CardSource, allTasks: Map<string, TaskSource>): CardState {
  if (card.desactivation) return { code: 'desactivee', motif: card.desactivation };
  if (card.fichiers) return { code: 'rubriques' };
  const waitingFor = pendingPrerequisites(card, allTasks);
  if (waitingFor.length) return { code: 'verrouillee', attend: waitingFor.map((t) => t.libelle) };
  const relevant = card.taches.filter((t) => t.statut !== 'non_necessaire');
  if (relevant.every(isDone)) {
    const dates = relevant
      .map((t) => t.valideeLe)
      .filter((d): d is string => !!d)
      .sort();
    return { code: 'close', le: dates.at(-1) ?? null };
  }
  return { code: 'ouverte' };
}

export function taskState(
  t: TaskSource,
  card: CardState,
  today: string,
  holidays: Feries,
  visaLock = false,
): TaskState {
  if (card.code === 'desactivee') return { code: 'desactivee' };
  if (t.statut === 'non_necessaire') return { code: 'non_necessaire' };
  if (awaitsVisa(t)) return { code: 'a_viser' };
  if (t.statut === 'validee') {
    return { code: 'validee', ecart: t.valideeLe && t.finLe ? hoursGap(t.valideeLe, t.finLe, holidays) : null };
  }
  if (t.statut === 'a_valider') return { code: 'a_valider', version: t.version };
  if (t.statut === 'reprise') {
    const due = t.prolongeeJusquau ?? t.finLe;
    return { code: 'reprise', version: t.version + 1, jours: due && due < today ? daysLate(due, today) : null };
  }
  if (card.code === 'verrouillee' || visaLock) return { code: 'verrouillee' };
  if (t.finLe && today > t.finLe) {
    const days = daysLate(t.finLe, today);
    return t.prolongeeJusquau && today <= t.prolongeeJusquau
      ? { code: 'prolongee', jusquau: t.prolongeeJusquau, jours: days }
      : { code: 'en_retard', jours: days };
  }
  if (t.debutLe && today >= t.debutLe) return { code: 'en_cours' };
  return { code: 'a_venir' };
}

// Compteurs « x/y tâches » : y hors tâches non nécessaires et cartes
// désactivées ; x = tâches validées.
export function stepSummary(stepNumber: number, states: { task: TaskSource; state: TaskState }[]): StepSummary {
  const counted = states.filter((e) => e.state.code !== 'desactivee' && e.state.code !== 'non_necessaire');
  const done = counted.filter((e) => e.state.code === 'validee').length;
  const late = counted.filter((e) => e.state.code === 'en_retard').length;
  const started = counted.some((e) =>
    ['en_cours', 'prolongee', 'validee', 'a_viser', 'a_valider', 'reprise'].includes(e.state.code),
  );
  const state: StepState =
    late > 0
      ? 'en_retard'
      : counted.length > 0 && done === counted.length
        ? 'terminee'
        : started
          ? 'en_cours'
          : 'a_venir';
  return { numero: stepNumber, faites: done, total: counted.length, enRetard: late, etat: state };
}

// Ce qu'attendent F2 et F3 (pastilles de la maquette : « F2 attend 02, 03,
// récépissé 04 », « F3 attend 06, 1 visa(s) d'étude »). Vide = plus rien.
export function invoiceWaits(steps: StepSummary[], cards: CardSource[]): { F2: string[]; F3: string[] } {
  const isFinished = (n: number) => steps.find((e) => e.numero === n)?.etat === 'terminee';
  const activeCards = cards.filter((c) => !c.desactivation);
  const deposit = activeCards.find((c) => c.cle === 'permis_construire')?.taches.find((t) => t.cle === 'depot');
  const studyVisas = activeCards
    .filter((c) => c.etapeCle === 'etudes')
    .flatMap((c) => c.taches)
    .filter((t) => /visa BC/i.test(t.libelle) && !isDone(t)).length;
  // Plans d'exécution validés mais pas encore visés par l'architecte DPLG.
  const dplgVisas = activeCards
    .filter((c) => c.etapeNumero === 6)
    .flatMap((c) => c.taches)
    .filter(awaitsVisa).length;
  return {
    F2: [
      ...[2, 3].filter((n) => !isFinished(n)).map((n) => String(n).padStart(2, '0')),
      ...(deposit && !isDone(deposit) ? ['récépissé 04'] : []),
    ],
    F3: [
      ...(isFinished(6) ? [] : ['06']),
      ...(studyVisas ? [`${studyVisas} visa(s) d'étude`] : []),
      ...(dplgVisas ? [`${dplgVisas} visa(s) DPLG`] : []),
    ],
  };
}
