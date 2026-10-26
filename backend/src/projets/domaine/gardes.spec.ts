import { joursRetardFacture, statutFactureEffectif, ventilationTva } from './gardes';

// Règles métier pures (aucune I/O). Ces fonctions sont le miroir serveur des
// gardes du front — une régression ici casse les deux côtés en silence.

describe('ventilationTva', () => {
  it('arrondit la TVA au franc et en déduit le TTC', () => {
    expect(ventilationTva(1_000_000, 18)).toEqual({
      montantTva: 180_000,
      montantTtc: 1_180_000,
    });
    // 333 333 * 18 % = 59 999,94 -> 60 000
    expect(ventilationTva(333_333, 18)).toEqual({
      montantTva: 60_000,
      montantTtc: 393_333,
    });
  });
});

describe('statutFactureEffectif', () => {
  const f = (over: Partial<Parameters<typeof statutFactureEffectif>[0]>) =>
    statutFactureEffectif(
      {
        statut: 'emise',
        echeanceLe: '2026-01-31',
        montantTtc: 1000,
        montantPaye: 0,
        ...over,
      },
      '2026-02-15',
    );

  it('renvoie le statut stocké tel quel hors « emise »', () => {
    expect(f({ statut: 'brouillon' })).toBe('brouillon');
    expect(f({ statut: 'annulee' })).toBe('annulee');
  });

  it('soldée l’emporte, même payée en retard', () => {
    expect(f({ montantPaye: 1000 })).toBe('payee');
    expect(f({ montantPaye: 1200 })).toBe('payee');
  });

  it('en retard avant partiellement payée', () => {
    expect(f({ montantPaye: 400 })).toBe('en_retard');
    expect(f({ montantPaye: 400, echeanceLe: '2026-03-01' })).toBe('partiellement_payee');
  });

  it('émise sans paiement ni retard', () => {
    expect(f({ echeanceLe: '2026-03-01' })).toBe('emise');
  });
});

describe('joursRetardFacture', () => {
  it('0 si pas d’échéance ou pas encore échue', () => {
    expect(joursRetardFacture(null, '2026-02-15')).toBe(0);
    expect(joursRetardFacture('2026-02-20', '2026-02-15')).toBe(0);
  });
  it('compte les jours pleins de dépassement (UTC)', () => {
    expect(joursRetardFacture('2026-02-05', '2026-02-15')).toBe(10);
  });
});
