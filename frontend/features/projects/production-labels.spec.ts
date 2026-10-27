import { describe, expect, it } from 'vitest';
import { productionRowFixture, productionViewFixture } from './fixtures';
import { stepNumber } from './labels';
import { laggingLabel, loadTone, pendingLabels, upcomingDeadlines } from './production-labels';

describe('production', () => {
  it('décisions en attente, au pluriel près', () => {
    expect(pendingLabels({ remises: 2, visas: 1, prolongations: 0, ts: 1 })).toEqual([
      '2 remises',
      '1 visa DPLG',
      '1 TS',
    ]);
    expect(pendingLabels({ remises: 0, visas: 0, prolongations: 0, ts: 0 })).toEqual([]);
  });

  it('ton d’une charge : sous la zone, dans la zone, au-dessus ; zone par défaut 70 à 100 %', () => {
    const zone = { de: 60, a: 90 };
    expect(loadTone(50, zone)).toBe('info');
    expect(loadTone(60, zone)).toBe('succes');
    expect(loadTone(95, zone)).toBe('risque');
    expect(loadTone(65, null)).toBe('info');
    expect(loadTone(null, zone)).toBe('neutre');
  });

  it('tâches en souffrance : une étape, ou le total et les étapes', () => {
    expect(laggingLabel([{ numero: 1, libelle: 'Onboard', taches: 1 }], stepNumber)).toBe(
      '1 tâche en souffrance dans 01 · Onboard',
    );
    expect(
      laggingLabel(
        [
          { numero: 1, libelle: 'Onboard', taches: 1 },
          { numero: 2, libelle: 'Esquisse', taches: 2 },
        ],
        stepNumber,
      ),
    ).toBe('3 tâches en souffrance : 01 (1), 02 (2)');
  });

  it('échéances des 14 jours : livraisons et fins de cartes clés, par date', () => {
    const view = productionViewFixture([
      productionRowFixture({ echeances: [{ carte: 'Permis de construire', finLe: '2026-11-03' }] }),
    ]);
    view.livraisons = [{ projetId: 'p2', code: 'DFS_ALM.26', client: 'Alima', livraisonLe: '2026-11-01' }];
    expect(upcomingDeadlines(view).map((e) => e.texte)).toEqual([
      'Livraison · DFS_ALM.26 · Alima',
      'Permis de construire · FS_POI.26',
    ]);
  });
});
