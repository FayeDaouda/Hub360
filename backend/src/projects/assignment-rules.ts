// Assignation d'une tâche de projet (maquette « Projets » : « Assigner »),
// à la tâche ou à toute la carte. Règle pure, testée.
//  - une tâche validée ou non nécessaire ne change plus d'assigné ;
//  - une carte désactivée n'a pas d'assignation (son temps n'est pas compté) ;
//  - à la carte : seules ses tâches encore ouvertes sont réassignées.

export type AssignableTask = { id: string; statut: string; cardDisabled: boolean };

export function unassignableReason(t: AssignableTask): string | null {
  if (t.cardDisabled) return 'Carte désactivée : pas d’assignation.';
  if (t.statut === 'validee') return 'Tâche validée : son assignation ne change plus.';
  if (t.statut === 'non_necessaire') return 'Tâche non nécessaire : pas d’assignation.';
  return null;
}

export function tasksToAssign(chosen: AssignableTask, card: AssignableTask[], wholeCard: boolean): string[] {
  if (!wholeCard) return unassignableReason(chosen) ? [] : [chosen.id];
  return card.filter((t) => !unassignableReason(t)).map((t) => t.id);
}
