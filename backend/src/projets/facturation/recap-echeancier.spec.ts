import { premiereDuProjet, recapEcheancier } from './facturation.service';

const ht = (n: number) => ({ toNumber: () => n });
const f = (id: string, cle: string | null, montant: number, emiseLe: string | null, statut = emiseLe ? 'emise' : 'brouillon') => ({
  id,
  cleEcheance: cle,
  devisEcheancierId: cle ? 'D1' : null,
  montantHt: ht(montant),
  emiseLe: emiseLe ? new Date(emiseLe) : null,
  creeLe: new Date('2026-01-01'),
  statut,
});

describe('document de facture : récapitulatif et première facture (revue CFO)', () => {
  const f1 = f('F1', 'CO:F1', 2_240_000, '2026-03-15');
  const f2 = f('F2', 'CO:F2', 2_240_000, '2026-10-21');
  const f3 = f('F3', 'CO:F3', 1_120_000, null);

  it('tranche F2 : total de l’offre, déjà facturé, présente, reste', () => {
    expect(recapEcheancier(f2, [f1, f2, f3])).toEqual({
      famille: 'CO',
      total: 5_600_000,
      deja: { tranches: ['F1'], ht: 2_240_000 },
      presente: { tranche: 'F2', ht: 2_240_000 },
      reste: { tranches: ['F3'], ht: 1_120_000 },
    });
  });

  it('tranche annulée par avoir puis refacturée : la nouvelle compte, l’ancienne non', () => {
    const f2Annulee = f('F2a', 'CO:F2', 2_240_000, '2026-10-01', 'annulee');
    const r = recapEcheancier(f3, [f1, f2Annulee, f3]);
    // F2 annulée et pas encore refacturée : à facturer.
    expect(r).toMatchObject({ total: 5_600_000, deja: { tranches: ['F1'] }, reste: { tranches: ['F2'], ht: 2_240_000 } });
    const r2 = recapEcheancier(f3, [f1, f2Annulee, f2, f3]);
    expect(r2).toMatchObject({ total: 5_600_000, deja: { tranches: ['F1', 'F2'], ht: 4_480_000 }, reste: { tranches: [], ht: 0 } });
  });

  it('hors échéancier : pas de récapitulatif', () => {
    expect(recapEcheancier(f('X', null, 100, null), [])).toBeNull();
  });

  it('première facture : aucune autre émise avant, même annulée', () => {
    expect(premiereDuProjet(f1, [f1, f2, f3])).toBe(true);
    expect(premiereDuProjet(f2, [f1, f2, f3])).toBe(false);
    expect(premiereDuProjet(f3, [f3])).toBe(true);
    expect(premiereDuProjet(f2, [f('F1', 'CO:F1', 1, '2026-03-15', 'annulee'), f2])).toBe(false);
  });
});
