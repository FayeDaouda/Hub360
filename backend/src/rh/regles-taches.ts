import { toIsoDay } from '../shared/dates';
// RH · Remise et validation des tâches (lot 5c). Règles pures, testées.
//
// Tirées de la maquette « Mon espace · Mes performances » : une tâche est
// « Remis · à valider » puis « Validée » ; « Respect des délais » = part des
// tâches validées qui ont été remises au plus tard à leur échéance (« 16
// tâches validées, dont 15 remises à temps ») ; « En cours » = tout ce qui
// n'est pas encore validé.

export type StatutTache =
  'validee' | 'remise' | 'a_reprendre' | 'en_retard' | 'prolongee' | 'bloquee' | 'en_cours' | 'a_venir' | 'a_planifier';

// Statut affiné par l'état commun des projets (projets/gabarit/etats.ts), le
// même que Production et Équipes (22/10/2026) : une prolongation accordée
// qualifie le retard (pas « en retard »), une carte verrouillée attend
// l'étape précédente (ni en cours, ni en retard).
export function statutSelonEtat(statut: StatutTache, etat: { code: string } | undefined): StatutTache {
  if (!etat || (statut !== 'en_retard' && statut !== 'en_cours' && statut !== 'a_venir')) return statut;
  if (etat.code === 'prolongee') return 'prolongee';
  if (etat.code === 'verrouillee') return 'bloquee';
  return statut;
}

export type EtatValidation = { remisLe: Date | null; valideLe: Date | null; renvoyeLe: Date | null } | null;

export function statutTache(
  t: { debut: string | null; echeance: string | null },
  v: EtatValidation,
  aujourdhui: string,
): StatutTache {
  if (v?.valideLe) return 'validee';
  if (v?.remisLe) return 'remise';
  if (v?.renvoyeLe) return 'a_reprendre';
  if (!t.debut || !t.echeance) return 'a_planifier';
  if (t.echeance < aujourdhui) return 'en_retard';
  return t.debut > aujourdhui ? 'a_venir' : 'en_cours';
}

export function statsPerformances(taches: { statut: StatutTache; echeance: string | null; remisLe: Date | null }[]) {
  const validees = taches.filter((t) => t.statut === 'validee');
  const jugees = validees.filter((t) => t.echeance && t.remisLe);
  const aTemps = jugees.filter((t) => toIsoDay(t.remisLe!) <= t.echeance!).length;
  return {
    total: taches.length,
    validees: validees.length,
    enCours: taches.length - validees.length,
    enRetard: taches.filter((t) => t.statut === 'en_retard').length,
    respectDelais: {
      aTemps,
      total: jugees.length,
      pct: jugees.length ? Math.round((aTemps / jugees.length) * 100) : null,
    },
  };
}

// Tâche du gabarit (TacheProjet) : son statut enregistré tient lieu d'état
// de validation (remise vNN à valider, reprise, validée).
export function etatValidationGabarit(t: {
  statut: 'a_faire' | 'a_valider' | 'reprise' | 'validee' | 'non_necessaire';
  remisLe: Date | null;
  valideeLe: Date | null;
}): EtatValidation {
  if (t.statut === 'validee') return { remisLe: t.remisLe, valideLe: t.valideeLe ?? new Date(0), renvoyeLe: null };
  if (t.statut === 'a_valider') return { remisLe: t.remisLe ?? new Date(0), valideLe: null, renvoyeLe: null };
  if (t.statut === 'reprise') return { remisLe: null, valideLe: null, renvoyeLe: new Date(0) };
  return null;
}
