import { daysBetween, formatDayMonth } from '@hub/domain';
import type { MyTask, TaskStatus } from './types';

// Libellé et pastille de chaque statut d'une tâche assignée.
export const TASK_STATUS_LABELS: Record<TaskStatus, { libelle: string; pill: string }> = {
  validee: { libelle: 'Validée', pill: 'pill--succes' },
  remise: { libelle: 'Remis · à valider', pill: 'pill--info' },
  a_reprendre: { libelle: 'À reprendre', pill: 'pill--risque' },
  en_retard: { libelle: 'En retard', pill: 'pill--risque' },
  prolongee: { libelle: 'Prolongée', pill: 'pill--attention' },
  bloquee: { libelle: 'Attend l’étape précédente', pill: 'pill--neutre' },
  en_cours: { libelle: 'En cours', pill: 'pill--info' },
  a_venir: { libelle: 'À venir', pill: 'pill--neutre' },
  a_planifier: { libelle: 'À planifier', pill: 'pill--neutre' },
};

// Libellé du statut, précisé par la fenêtre quand la tâche est ouverte.
export function statusLabel(t: MyTask, today: string): string {
  if (t.statut === 'en_cours') {
    const left = daysBetween(today, t.echeance!);
    return left === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${left} j`;
  }
  if (t.statut === 'a_venir') return `À venir · J-${daysBetween(today, t.debut!)}`;
  if (t.statut === 'en_retard') return `En retard · ${daysBetween(t.echeance!, today)} j`;
  if (t.statut === 'prolongee' && t.prolongeeJusquau) return `Prolongée jusqu’au ${formatDayMonth(t.prolongeeJusquau)}`;
  return TASK_STATUS_LABELS[t.statut].libelle;
}
