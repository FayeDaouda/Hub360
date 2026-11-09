// Qui dépose (« coche ») une tâche de projet — décision du 09/11/2026, sur
// toutes les tâches du gabarit :
//  - la personne assignée, sa propre tâche ;
//  - l'Écriture de « Projets et cartes » (matrice : le Dir. GC…), n'importe
//    quelle tâche, assignée ou non ;
//  - le chef d'une équipe du projet, sans case dans la matrice (comme pour
//    l'assignation) : une tâche sans assigné, ou assignée à un membre de ses
//    équipes.
// L'assignation ne change pas : le dépôt est tracé au nom de qui l'a fait.
// Règle pure, partagée par le dépôt (TaskSubmissionService) et le bouton
// « Déposer » (ProjectFileService) ; testée.

export type DepositActor = {
  employeeId: string | null; // fiche d'équipe du compte connecté
  canWriteProjects: boolean; // Écriture de « Projets et cartes »
  chiefCellIds: string[]; // équipes du projet dont il est le chef
};

export type DepositTask = { assigneId: string | null; assigneCelluleId: string | null };

export function canDeposit(actor: DepositActor, task: DepositTask): boolean {
  if (actor.employeeId && task.assigneId === actor.employeeId) return true;
  if (actor.canWriteProjects) return true;
  if (!actor.chiefCellIds.length) return false;
  if (!task.assigneId) return true;
  return !!task.assigneCelluleId && actor.chiefCellIds.includes(task.assigneCelluleId);
}

// Dépôt fait à la place de la personne assignée (tracé, et elle est prévenue).
export const depositsForSomeoneElse = (actor: DepositActor, task: DepositTask) =>
  !!task.assigneId && task.assigneId !== actor.employeeId;
