import { monthlyLoad, cellCode, onTimeShare, companyPrefix, tasksInProgress, type TeamTask } from './teams-rules';

// Équipes (maquette du boss) : nomenclature et indicateurs des cellules.
const tache = (o: Partial<TeamTask>): TeamTask => ({
  debut: '2026-09-14',
  echeance: '2026-09-18',
  heures: 10,
  statut: 'a_faire',
  valideeLe: null,
  ...o,
});

describe('nomenclature des cellules', () => {
  it('SOCIÉTÉ-PROCESSUS-NN, initiales de la société', () => {
    expect(companyPrefix('Grey Concrete')).toBe('GC');
    expect(cellCode('GC', 'ARC', 4)).toBe('GC-ARC-04');
    expect(cellCode('GC', 'ETU', 12)).toBe('GC-ETU-12');
  });
});

describe('onTimeShare', () => {
  it('validées à l’échéance ou avant, sur les validées ; null sans livraison', () => {
    expect(onTimeShare([tache({}), tache({ statut: 'non_necessaire' })])).toBeNull();
    expect(
      onTimeShare([
        tache({ statut: 'validee', valideeLe: '2026-09-18' }),
        tache({ statut: 'validee', valideeLe: '2026-09-17' }),
        tache({ statut: 'validee', valideeLe: '2026-09-21' }),
        tache({}),
      ]),
    ).toBe(67);
  });
});

describe('tasksInProgress', () => {
  it('état commun des projets : démarrées, pas faites ; prolongée = retard qualifié, non compté', () => {
    const r = tasksInProgress([
      'en_cours',
      'en_retard',
      'prolongee',
      'a_valider',
      'a_venir',
      'verrouillee',
      'validee',
      'non_necessaire',
      'desactivee',
    ]);
    expect(r).toEqual({ enCours: 4, enRetard: 1, pctATemps: 75 });
    expect(tasksInProgress([]).pctATemps).toBeNull();
  });
});

describe('monthlyLoad', () => {
  it('tâches touchant le mois, heures imputées jusqu’à aujourd’hui', () => {
    const r = monthlyLoad(
      [
        tache({}), // 14 → 18/09 : 10 h sur 5 j, 3 j passés le 16
        tache({ debut: '2026-08-03', echeance: '2026-08-07' }), // hors mois
        tache({ statut: 'non_necessaire' }),
      ],
      [],
      '2026-09-16',
      new Set(),
    );
    expect(r).toEqual({ taches: 1, heures: 6 });
  });
});
