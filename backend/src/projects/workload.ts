import {
  arrondi,
  AUCUN_FERIE,
  HEURES_PAR_JOUR,
  heuresTache,
  joursAbsents,
  joursOuvres,
  type Feries,
  type Periode,
  type Tache,
} from '../rh/regles-temps';

export type Workload = {
  disponibles: number; // heures ouvrées de présence sur la période
  assignees: number; // heures standard de ses autres tâches tombant dans la période
  joursAbsence: number; // jours ouvrés d'absence validée dans la période
  pourcentage: number | null; // avec la tâche à assigner ; null = aucune heure disponible
};

// Charge prévisionnelle d'une personne sur la fenêtre de la tâche à assigner
// (ou des tâches d'un bloc, assigné d'un coup),
// avec les règles des feuilles de temps (rh/regles-temps.ts) : durée standard
// répartie sur la fenêtre de chaque tâche, 8 h par jour ouvré, fériés et
// absences validées retirés — le même chiffre que l'indicateur « Charge des
// équipes », vu avant d'assigner.
export function workloadOver(
  period: Periode,
  others: Tache[],
  task: Tache | Tache[],
  absences: Periode[],
  holidays: Feries = AUCUN_FERIE,
): Workload {
  const absentDays = joursAbsents(absences, holidays);
  const workdays = joursOuvres(period, holidays);
  const presentDays = workdays.filter((j) => !absentDays.has(j)).length;
  const available = presentDays * HEURES_PAR_JOUR;
  const assigned = others.reduce((s, t) => s + heuresTache(t, absentDays, period, holidays), 0);
  const chosen = Array.isArray(task) ? task : [task];
  const withTask = assigned + chosen.reduce((s, t) => s + heuresTache(t, absentDays, period, holidays), 0);
  return {
    disponibles: available,
    assignees: arrondi(assigned),
    joursAbsence: workdays.length - presentDays,
    pourcentage: available > 0 ? Math.round((withTask / available) * 100) : null,
  };
}
