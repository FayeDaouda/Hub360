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
    const s = soldeConges(
      '2026-01-01',
      [
        { type: 'conge_paye', statut: 'validee', jours: 5, dateDebut: '2026-03-02' },
        { type: 'conge_paye', statut: 'attente_n1', jours: 2, dateDebut: '2026-10-05' },
        { type: 'conge_paye', statut: 'refusee', jours: 9, dateDebut: '2026-04-01' },
        { type: 'maladie', statut: 'validee', jours: 3, dateDebut: '2026-05-04' },
      ],
      '2026-09-01',
    );
    expect(s).toEqual({ annee: 2026, report: 0, plafondReport: 0, acquis: 16, pris: 5, enAttente: 2, disponible: 9 });
  });

  it('année civile (maquette : « Acquis 2026 ») : entrée en 2023, au 30/09 → 16 j, report 0', () => {
    const s = soldeConges(
      '2023-02-01',
      [{ type: 'conge_paye', statut: 'validee', jours: 10, dateDebut: '2025-08-04' }],
      '2026-09-30',
    );
    expect(s).toEqual({ annee: 2026, report: 0, plafondReport: 0, acquis: 16, pris: 0, enAttente: 0, disponible: 16 });
  });

  it('entrée en cours d’année : acquis depuis l’entrée', () => {
    expect(soldeConges('2026-06-15', [], '2026-09-30').acquis).toBe(6);
  });
});

describe('joursOuvrables · jours fériés', () => {
  it('un férié n’est pas décompté du congé', () => {
    const { joursOuvrables } = jest.requireActual('./regles-conges');
    expect(joursOuvrables('2026-12-21', '2026-12-26')).toBe(6);
    expect(joursOuvrables('2026-12-21', '2026-12-26', new Set(['2026-12-25']))).toBe(5);
  });

  // Report plafonné (user, 19/10/2026), compté depuis 2026.
  it('report : restant de l’année passée, plafonné', () => {
    const pris = [{ type: 'conge_paye', statut: 'validee', jours: 10, dateDebut: '2026-08-03' }];
    // 2026 : 24 acquis − 10 pris = 14 restants → plafond 5.
    expect(soldeConges('2020-01-01', pris, '2027-03-15', 5)).toMatchObject({ report: 5, acquis: 4, disponible: 9 });
    expect(soldeConges('2020-01-01', pris, '2027-03-15', 30).report).toBe(14);
    // Sans plafond (0) : pas de report ; et rien avant 2026.
    expect(soldeConges('2020-01-01', pris, '2027-03-15').report).toBe(0);
    expect(soldeConges('2020-01-01', [], '2026-03-15', 30).report).toBe(0);
  });
});
