import { describe, expect, it } from 'vitest';
import { LIBELLES_REPONSE, RAPPEL_MAX_MINUTES, RAPPELS_MINUTES } from './agenda';

// Agenda (12/11/2026) : la liste des rappels est la seule source.
describe('agenda', () => {
  it('rappels : 10 min, 30 min, 1 h, la veille ; le plus long fixe l’horizon des tournées', () => {
    expect(RAPPELS_MINUTES).toEqual([10, 30, 60, 1440]);
    expect(RAPPEL_MAX_MINUTES).toBe(1440);
  });
  it('libellés des réponses', () => {
    expect(LIBELLES_REPONSE).toEqual({ oui: 'Oui', non: 'Non', peut_etre: 'Peut-être' });
  });
});
