import { reminderPossibleOn } from './task-reminder';

describe('relance du validateur', () => {
  it('3 jours ouvrés après le dépôt, puis après la dernière relance', () => {
    // Dépôt le jeudi 22/10 → vendredi 23 (1), lundi 26 (2), mardi 27 (3).
    expect(reminderPossibleOn(new Date('2026-10-22T09:00:00Z'), null, new Set())).toBe('2026-10-27');
    // Relancé le 27/10 : prochaine relance le vendredi 30/10.
    expect(reminderPossibleOn(new Date('2026-10-22T09:00:00Z'), new Date('2026-10-27T08:00:00Z'), new Set())).toBe(
      '2026-10-30',
    );
    // Un jour férié ne compte pas.
    expect(reminderPossibleOn(new Date('2026-10-22T09:00:00Z'), null, new Set(['2026-10-26']))).toBe('2026-10-28');
  });
});
