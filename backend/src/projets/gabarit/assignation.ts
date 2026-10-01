// Assignation d'une tâche de projet (maquette « Projets » : « Assigner »),
// à la tâche ou à toute la carte. Règle pure, testée.
//  - une tâche validée ou non nécessaire ne change plus d'assigné ;
//  - une carte désactivée n'a pas d'assignation (son temps n'est pas compté) ;
//  - à la carte : seules ses tâches encore ouvertes sont réassignées.

export type TacheAAssigner = { id: string; statut: string; carteDesactivee: boolean };

export function motifNonAssignable(t: TacheAAssigner): string | null {
  if (t.carteDesactivee) return 'Carte désactivée : pas d’assignation.';
  if (t.statut === 'validee') return 'Tâche validée : son assignation ne change plus.';
  if (t.statut === 'non_necessaire') return 'Tâche non nécessaire : pas d’assignation.';
  return null;
}

export function tachesAssignees(choisie: TacheAAssigner, carte: TacheAAssigner[], aLaCarte: boolean): string[] {
  if (!aLaCarte) return motifNonAssignable(choisie) ? [] : [choisie.id];
  return carte.filter((t) => !motifNonAssignable(t)).map((t) => t.id);
}
