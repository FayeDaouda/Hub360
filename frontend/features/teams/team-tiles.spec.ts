import { describe, expect, it } from 'vitest';
import { teamsViewFixture } from './fixtures';
import { teamTiles } from './team-tiles';

describe('teamTiles', () => {
  it('compose les cinq indicateurs, calculés au back', () => {
    const tiles = teamTiles(teamsViewFixture(), true, 2);
    expect(tiles.map((t) => [t.key, t.value])).toEqual([
      ['cellules', '1 / 2'],
      ['affecter', '0'],
      ['projets', '0'],
      ['taches', '0'],
      ['absences', '2'],
    ]);
    expect(tiles[0].hint).toBe('actives · créer, consulter');
  });

  it('lecture seule, absences pas encore comptées, retards en étapes', () => {
    const view = teamsViewFixture();
    view.indicateurs.taches = { enCours: 5, enRetard: 2, pctATemps: 60, etapesEnRetard: 3 };
    view.indicateurs.projetsSignes = { total: 4, nonAffectes: 1 };
    const tiles = teamTiles(view, false, null);
    expect(tiles[0].hint).toBe('actives · consulter');
    expect(tiles[2]).toMatchObject({ hint: '1 à affecter', tone: 'attention' });
    expect(tiles[3].hint).toBe('60 % à temps · 2 en retard, soit 3 étapes');
    expect(tiles[4].value).toBe('…');
  });
});
