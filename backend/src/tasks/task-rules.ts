import { toIsoDay } from '@hub/domain';
// Tâches assignées : remise, validation et retard. Règles pures, testées.
//
// Tirées de la maquette « Mon espace · Mes performances » : une tâche est
// « Remis · à valider » puis « Validée » ; « Respect des délais » = part des
// tâches validées qui ont été remises au plus tard à leur échéance (« 16
// tâches validées, dont 15 remises à temps ») ; « En cours » = tout ce qui
// n'est pas encore validé.

export const TASK_STATUSES = [
  'validee',
  'remise',
  'a_reprendre',
  'en_retard',
  'prolongee',
  'bloquee',
  'en_cours',
  'a_venir',
  'a_planifier',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Statut affiné par l'état commun des projets (projets/gabarit/etats.ts), le
// même que Production et Équipes (22/10/2026) : une prolongation accordée
// qualifie le retard (pas « en retard »), une carte verrouillée attend
// l'étape précédente (ni en cours, ni en retard).
export function statusFromProjectState(status: TaskStatus, state: { code: string } | undefined): TaskStatus {
  if (!state || (status !== 'en_retard' && status !== 'en_cours' && status !== 'a_venir')) return status;
  if (state.code === 'prolongee') return 'prolongee';
  if (state.code === 'verrouillee') return 'bloquee';
  return status;
}

export type ValidationState = { remisLe: Date | null; valideLe: Date | null; renvoyeLe: Date | null } | null;

export function taskStatus(
  t: { debut: string | null; echeance: string | null },
  v: ValidationState,
  today: string,
): TaskStatus {
  if (v?.valideLe) return 'validee';
  if (v?.remisLe) return 'remise';
  if (v?.renvoyeLe) return 'a_reprendre';
  if (!t.debut || !t.echeance) return 'a_planifier';
  if (t.echeance < today) return 'en_retard';
  return t.debut > today ? 'a_venir' : 'en_cours';
}

// Date qui fait foi pour l'urgence : la nouvelle date accordée si la tâche
// est prolongée, sinon l'échéance.
export function effectiveDue(t: { statut: TaskStatus; echeance: string | null; prolongeeJusquau: string | null }) {
  return t.statut === 'prolongee' && t.prolongeeJusquau ? t.prolongeeJusquau : t.echeance;
}

// Retard (règle validée le 23/10/2026 : le retard est un attribut, pas une
// catégorie) : échéance passée — la date accordée pour une prolongée —,
// reprises comprises. Une tâche « bloquée » attend l'étape précédente : son
// retard ne lui est pas imputable. Calculé ici depuis S2 (il l'était au front).
export function isLate(
  t: { statut: TaskStatus; echeance: string | null; prolongeeJusquau: string | null },
  today: string,
): boolean {
  if (t.statut === 'en_retard') return true;
  if (t.statut !== 'a_reprendre' && t.statut !== 'prolongee') return false;
  const due = effectiveDue(t);
  return !!due && due < today;
}

export function performanceStats(tasks: { statut: TaskStatus; echeance: string | null; remisLe: Date | null }[]) {
  const validated = tasks.filter((t) => t.statut === 'validee');
  const judged = validated.filter((t) => t.echeance && t.remisLe);
  const onTime = judged.filter((t) => toIsoDay(t.remisLe!) <= t.echeance!).length;
  return {
    total: tasks.length,
    validees: validated.length,
    enCours: tasks.length - validated.length,
    enRetard: tasks.filter((t) => t.statut === 'en_retard').length,
    respectDelais: {
      aTemps: onTime,
      total: judged.length,
      pct: judged.length ? Math.round((onTime / judged.length) * 100) : null,
    },
  };
}

// Tâche du gabarit (TacheProjet) : son statut enregistré tient lieu d'état
// de validation (remise vNN à valider, reprise, validée).
export function templateValidationState(t: {
  statut: 'a_faire' | 'a_valider' | 'reprise' | 'validee' | 'non_necessaire';
  remisLe: Date | null;
  valideeLe: Date | null;
}): ValidationState {
  if (t.statut === 'validee') return { remisLe: t.remisLe, valideLe: t.valideeLe ?? new Date(0), renvoyeLe: null };
  if (t.statut === 'a_valider') return { remisLe: t.remisLe ?? new Date(0), valideLe: null, renvoyeLe: null };
  if (t.statut === 'reprise') return { remisLe: null, valideLe: null, renvoyeLe: new Date(0) };
  return null;
}
