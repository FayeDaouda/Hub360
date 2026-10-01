import { echeanceDirecte, ErreurFactureDirecte, lignesFactureDirecte } from './facture-directe';

describe('facture directe d’un lead', () => {
  it('lignes nettoyées ; désignation et montant entier positif obligatoires', () => {
    expect(lignesFactureDirecte([{ designation: ' CO0 · Diagnostic ', montantHt: 100_000 }])).toEqual([
      { designation: 'CO0 · Diagnostic', montantHt: 100_000 },
    ]);
    expect(() => lignesFactureDirecte([])).toThrow(ErreurFactureDirecte);
    expect(() => lignesFactureDirecte([{ designation: '  ', montantHt: 10 }])).toThrow('désignation');
    expect(() => lignesFactureDirecte([{ designation: 'x', montantHt: 0 }])).toThrow('montant');
    expect(() => lignesFactureDirecte([{ designation: 'x', montantHt: 10.5 }])).toThrow('montant');
  });

  it('payable à 15 jours (maquette : émise le 23/09, échéance 08/10)', () => {
    expect(echeanceDirecte('2026-09-23')).toBe('2026-10-08');
  });
});
