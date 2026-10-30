import { describe, expect, it, vi } from 'vitest';
import { boardFixture, cardFixture, fileFixture, taskFixture } from './fixtures';
import { boardTiles, defaultStep, employeeTiles, invoicePills, myOpenTasksIn } from './project-tiles';

describe('defaultStep', () => {
  it('l’étape de ma première tâche ouverte, sinon la première étape pas finie', () => {
    const file = fileFixture();
    expect(defaultStep(file)).toBe(1);
    file.cartes[1].taches = [taskFixture({ id: 't2', aMoi: true })];
    expect(defaultStep(file)).toBe(2);
    file.cartes[1].taches = [taskFixture({ id: 't2', aMoi: true, statut: 'validee' })];
    file.etapes[0].faites = 1;
    expect(defaultStep(file)).toBe(2);
  });

  it('mes tâches ouvertes dans une étape', () => {
    const file = fileFixture({
      cartes: [
        cardFixture({ taches: [taskFixture({ aMoi: true }), taskFixture({ id: 'x', aMoi: true, statut: 'validee' })] }),
      ],
    });
    expect(myOpenTasksIn(file, 1)).toBe(1);
    expect(myOpenTasksIn(file, 2)).toBe(0);
  });
});

describe('tuiles', () => {
  it('direction : « Remises à valider », ou « À valider par vous » cliquable pour le DPLG', () => {
    const open = vi.fn();
    const board = boardFixture();
    board.kpi = { ...board.kpi, remisesAValider: 3, aValiderParVous: [{ projetId: 'p1', tacheId: 't1' }] };
    expect(boardTiles(board, false, false, open)[0]).toMatchObject({ id: 'remises', value: 3 });
    const dplg = boardTiles(board, true, false, open)[0];
    expect(dplg).toMatchObject({ id: 'a-valider', value: 1 });
    expect(dplg.action).toEqual({ type: 'dialog', onClick: open });
  });

  it('pas encore chargé : « … », état neutre de marque', () => {
    const tiles = boardTiles(null, false, false, vi.fn());
    expect(tiles.map((t) => t.value)).toEqual(['…', '…', '…', '…']);
    expect(tiles[3].state).toBe('marque');
  });

  it('TS non acceptés au-delà du délai : signalement en retard', () => {
    const board = boardFixture();
    board.kpi = { ...board.kpi, tsNonAcceptes: 1, mentions: 2 };
    expect(boardTiles(board, false, false, vi.fn())[3]).toMatchObject({
      value: 3,
      state: 'risque',
      hint: '1 TS non accepté(s) · 2 tâche(s)',
    });
  });

  it('Salarié : ses tâches, liens vers Mes tâches filtré ; « À valider par vous » s’il est chef', () => {
    const counts = { reprises: 1, retards: 2, attente: 0, mentions: 4 };
    const tiles = employeeTiles(counts, boardFixture(), 'gc', vi.fn());
    expect(tiles.map((t) => [t.id, t.value])).toEqual([
      ['reprises', 1],
      ['retard', 2],
      ['attente', 0],
      ['mentions', 4],
    ]);
    expect(tiles[1].action).toEqual({ type: 'link', href: '/admin/gc/mes-taches?filtre=retards' });
    const board = boardFixture();
    board.kpi.aValiderParVous = [{ projetId: 'p1', tacheId: 't1' }];
    expect(employeeTiles(counts, board, 'gc', vi.fn())[3].id).toBe('a-valider');
  });
});

describe('repères du dossier', () => {
  it('factures : émises, puis la première en attente mise en avant', () => {
    expect(invoicePills(fileFixture())).toEqual([
      { libelle: 'F1 émise · projet ouvert', ton: 'succes' },
      { libelle: 'F2 attend 02, 03', ton: 'attention' },
      { libelle: 'F3 attend 06', ton: 'neutre' },
    ]);
  });
});
