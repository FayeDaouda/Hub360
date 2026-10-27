import { dureeVerrouillage, estVerrouille } from './verrouillage';

// Décision du 28/10/2026 (lot C) : 15 min, doublée à chaque récidive,
// plafonnée à 1 h.
describe('Verrouillage des comptes', () => {
  it('15 min, puis 30, puis 1 h, jamais plus', () => {
    const minutes = [0, 1, 2, 3, 8].map((n) => dureeVerrouillage(n) / 60_000);
    expect(minutes).toEqual([15, 30, 60, 60, 60]);
  });

  it('verrouillé jusqu’à la date fixée, plus après', () => {
    const fin = new Date(Date.UTC(2026, 9, 28, 10, 15));
    expect(estVerrouille(fin, new Date(Date.UTC(2026, 9, 28, 10, 14)))).toBe(true);
    expect(estVerrouille(fin, new Date(Date.UTC(2026, 9, 28, 10, 15)))).toBe(false);
    expect(estVerrouille(null)).toBe(false);
  });
});
