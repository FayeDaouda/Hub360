import { toIsoDay } from '@hub/domain';
import { apresJoursOuvres } from '../projets/gabarit/calendrier';

// Relance du validateur par l'assigné (Mes tâches, règle validée le
// 23/10/2026) : 3 jours ouvrés après le dépôt, puis après chaque relance.
export const REMINDER_DELAY_WORKDAYS = 3;
export function reminderPossibleOn(submittedAt: Date, lastReminder: Date | null, holidays: Set<string>): string {
  const base = [submittedAt, lastReminder].filter((d): d is Date => !!d).reduce((a, b) => (a > b ? a : b));
  return apresJoursOuvres(toIsoDay(base), REMINDER_DELAY_WORKDAYS, holidays);
}
