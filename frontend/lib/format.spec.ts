import { describe, expect, it } from 'vitest';
import { formatAmount, formatCompactAmount, formatNumber } from './format';
import { capitalize, plural, stripAccents } from './text';

// Mêmes rendus que les anciennes copies (« fcfa », « formatMontant »).
const ancienFcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

describe('montants', () => {
  it.each([0, 1_770_000, 2_643_200.4, 1_500_000.5, -75_600])('%s comme les anciennes copies', (n) => {
    expect(formatAmount(n)).toBe(ancienFcfa(n));
  });

  it('montant compact et nombre', () => {
    expect(formatCompactAmount(1_770_000)).toBe(
      `${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(1_770_000)} FCFA`,
    );
    expect(formatNumber(20_154_400)).toBe((20_154_400).toLocaleString('fr-FR'));
  });
});

describe('texte', () => {
  it('sans accents', () => {
    expect(stripAccents('Équipe Études Ça')).toBe('Equipe Etudes Ca');
  });

  it('pluriel régulier', () => {
    expect(plural(0, 'facture')).toBe('0 facture');
    expect(plural(1, 'facture')).toBe('1 facture');
    expect(plural(3, 'facture')).toBe('3 factures');
  });

  it('capitale initiale', () => {
    expect(capitalize('octobre 2026')).toBe('Octobre 2026');
  });
});
