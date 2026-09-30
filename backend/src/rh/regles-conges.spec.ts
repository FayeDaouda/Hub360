import { joursOuvrables, moisComplets, soldeConges, veille } from './regles-conges';

describe('règles de congés (hypothèses de travail)', () => {
  it('semaine complète = 6 jours ouvrables (samedi compté, dimanche exclu)', () => {
    expect(joursOuvrables('2026-09-21', '2026-09-27')).toBe(6); // lundi → dimanche
  });
  it('un dimanche seul = 0', () => expect(joursOuvrables('2026-09-27', '2026-09-27')).toBe(0));
  it('veille franchit le mois', () => expect(veille('2026-10-01')).toBe('2026-09-30'));
  it('mois complets', () => {
    expect(moisComplets('2026-01-15', '2026-09-14')).toBe(7);
    expect(moisComplets('2026-01-15', '2026-09-15')).toBe(8);
    expect(moisComplets(null, '2026-09-15')).toBe(0);
  });
  it('solde : 2 j/mois, congés payés validés et en attente déduits, maladie non', () => {
    const s = soldeConges('2026-01-01', [
      { type: 'conge_paye', statut: 'validee', jours: 5 },
      { type: 'conge_paye', statut: 'attente_n1', jours: 2 },
      { type: 'conge_paye', statut: 'refusee', jours: 9 },
      { type: 'maladie', statut: 'validee', jours: 3 },
    ], '2026-09-01');
    expect(s).toEqual({ acquis: 16, pris: 5, enAttente: 2, disponible: 9 });
  });
});

describe('joursOuvrables · jours fériés', () => {
  it('un férié n’est pas décompté du congé', () => {
    const { joursOuvrables } = jest.requireActual('./regles-conges');
    expect(joursOuvrables('2026-12-21', '2026-12-26')).toBe(6);
    expect(joursOuvrables('2026-12-21', '2026-12-26', new Set(['2026-12-25']))).toBe(5);
  });
});
