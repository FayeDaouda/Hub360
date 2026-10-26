import { formatAmount } from './format';
import { escapeHtml, plural, stripAccents } from './text';

// Mêmes rendus que les anciennes copies (« fcfa », « formatMontant », « echapper »).
const ancienFcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

describe('montants', () => {
  it.each([0, 1_770_000, 2_643_200.4, 1_500_000.5, -75_600])('%s comme les anciennes copies', (n) => {
    expect(formatAmount(n)).toBe(ancienFcfa(n));
  });
});

describe('texte', () => {
  it('sans accents', () => {
    expect(stripAccents('Équipe Études Ça')).toBe('Equipe Etudes Ca');
  });

  it('pluriel régulier', () => {
    expect(plural(1, 'facture')).toBe('1 facture');
    expect(plural(3, 'facture')).toBe('3 factures');
  });

  it('échappement HTML', () => {
    expect(escapeHtml('<b>"Fatou & Cie"</b>')).toBe('&lt;b&gt;&quot;Fatou &amp; Cie&quot;&lt;/b&gt;');
  });
});
