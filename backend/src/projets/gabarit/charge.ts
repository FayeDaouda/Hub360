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
} from '../../rh/regles-temps';

export type Charge = {
  disponibles: number; // heures ouvrées de présence sur la période
  assignees: number; // heures standard de ses autres tâches tombant dans la période
  joursAbsence: number; // jours ouvrés d'absence validée dans la période
  pourcentage: number | null; // avec la tâche à assigner ; null = aucune heure disponible
};

// Charge prévisionnelle d'une personne sur la fenêtre de la tâche à assigner,
// avec les règles des feuilles de temps (rh/regles-temps.ts) : durée standard
// répartie sur la fenêtre de chaque tâche, 8 h par jour ouvré, fériés et
// absences validées retirés — le même chiffre que l'indicateur « Charge des
// équipes », vu avant d'assigner.
export function chargeSurPeriode(p: Periode, autres: Tache[], tache: Tache, absences: Periode[], feries: Feries = AUCUN_FERIE): Charge {
  const absents = joursAbsents(absences, feries);
  const ouvres = joursOuvres(p, feries);
  const presents = ouvres.filter((j) => !absents.has(j)).length;
  const disponibles = presents * HEURES_PAR_JOUR;
  const assignees = autres.reduce((s, t) => s + heuresTache(t, absents, p, feries), 0);
  const avec = assignees + heuresTache(tache, absents, p, feries);
  return {
    disponibles,
    assignees: arrondi(assignees),
    joursAbsence: ouvres.length - presents,
    pourcentage: disponibles > 0 ? Math.round((avec / disponibles) * 100) : null,
  };
}
