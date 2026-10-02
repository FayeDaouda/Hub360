import { chargeDuMois, codeCellule, etapesEnCours, partATemps, prefixeSociete, type TacheEquipe } from './equipes-regles';

// Équipes (maquette du boss) : nomenclature et indicateurs des cellules.
const tache = (o: Partial<TacheEquipe>): TacheEquipe => ({
  debut: '2026-09-14',
  echeance: '2026-09-18',
  heures: 10,
  statut: 'a_faire',
  valideeLe: null,
  ...o,
});

describe('nomenclature des cellules', () => {
  it('SOCIÉTÉ-PROCESSUS-NN, initiales de la société', () => {
    expect(prefixeSociete('Grey Concrete')).toBe('GC');
    expect(codeCellule('GC', 'ARC', 4)).toBe('GC-ARC-04');
    expect(codeCellule('GC', 'ETU', 12)).toBe('GC-ETU-12');
  });
});

describe('partATemps', () => {
  it('validées à l’échéance ou avant, sur les validées ; null sans livraison', () => {
    expect(partATemps([tache({}), tache({ statut: 'non_necessaire' })])).toBeNull();
    expect(
      partATemps([
        tache({ statut: 'validee', valideeLe: '2026-09-18' }),
        tache({ statut: 'validee', valideeLe: '2026-09-17' }),
        tache({ statut: 'validee', valideeLe: '2026-09-21' }),
        tache({}),
      ]),
    ).toBe(67);
  });
});

describe('etapesEnCours', () => {
  it('commencées, ni validées ni non nécessaires ; retard = échéance dépassée', () => {
    const r = etapesEnCours(
      [
        tache({}), // en cours, à l'heure
        tache({ echeance: '2026-09-15' }), // en retard
        tache({ debut: '2026-10-01', echeance: '2026-10-05' }), // pas commencée
        tache({ statut: 'validee', valideeLe: '2026-09-15' }),
        tache({ statut: 'non_necessaire' }),
      ],
      '2026-09-16',
    );
    expect(r).toEqual({ enCours: 2, enRetard: 1, pctATemps: 50 });
    expect(etapesEnCours([], '2026-09-16').pctATemps).toBeNull();
  });
});

describe('chargeDuMois', () => {
  it('tâches touchant le mois, heures imputées jusqu’à aujourd’hui', () => {
    const r = chargeDuMois(
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
