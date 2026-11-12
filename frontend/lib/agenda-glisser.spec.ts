import { describe, expect, it } from 'vitest';
import { creneauDe, deplacer, instants, memeCreneau, redimensionner } from './agenda-glisser';

const J = '2026-11-12';
const c = creneauDe(`${J}T09:00:00.000Z`, `${J}T10:00:00.000Z`);

// Glisser-déplacer dans la grille de l'Agenda (12/11/2026).
describe('agenda-glisser', () => {
  it('déplacer garde la durée, se cale au quart d’heure et peut changer de jour', () => {
    expect(deplacer(c, 37, J)).toEqual({ jour: J, debut: 570, fin: 630 }); // 09:37 → 09:30 (le quart d’heure le plus proche)
    expect(deplacer(c, 0, '2026-11-13')).toEqual({ jour: '2026-11-13', debut: 540, fin: 600 });
  });

  it('déplacer reste dans la journée', () => {
    expect(deplacer(c, -600, J)).toMatchObject({ debut: 0, fin: 60 });
    expect(deplacer(c, 900, J)).toMatchObject({ debut: 1380, fin: 1440 });
  });

  it('redimensionner : 15 minutes au moins, minuit au plus', () => {
    expect(redimensionner(c, 22)).toMatchObject({ debut: 540, fin: 615 });
    expect(redimensionner(c, -120)).toMatchObject({ fin: 555 });
    expect(redimensionner(c, 2000)).toMatchObject({ fin: 1440 });
  });

  it('instants : heure de Dakar ; minuit devient 23:59', () => {
    expect(instants({ jour: J, debut: 600, fin: 660 })).toEqual({
      debut: `${J}T10:00:00.000Z`,
      fin: `${J}T11:00:00.000Z`,
    });
    expect(instants({ jour: J, debut: 1380, fin: 1440 }).fin).toBe(`${J}T23:59:00.000Z`);
    expect(memeCreneau(c, { ...c })).toBe(true);
  });
});
