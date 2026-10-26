import { formaterNumero, formatParDefaut, initiales, prochaineSequence, refusFormat } from './numerotation';

describe('numérotation des factures (lot 6, à la manière de Zervant)', () => {
  it('format par défaut : initiales de la société, année sur 4 chiffres, 4 chiffres', () => {
    expect(initiales('Grey Concrete')).toBe('GC');
    expect(formaterNumero(formatParDefaut('Grey Concrete'), 2026, 1)).toBe('GC-2026-0001');
  });

  it('préfixe TEST, année sur 2 chiffres, séparateur, sans préfixe', () => {
    expect(
      formaterNumero({ prefixe: 'TEST', formatAnnee: 'AAAA', separateur: '-', chiffres: 4, numeroDepart: 1 }, 2026, 12),
    ).toBe('TEST-2026-0012');
    expect(
      formaterNumero({ prefixe: 'GC', formatAnnee: 'AA', separateur: '/', chiffres: 3, numeroDepart: 1 }, 2027, 5),
    ).toBe('GC/27/005');
    expect(
      formaterNumero({ prefixe: '', formatAnnee: 'AAAA', separateur: '-', chiffres: 4, numeroDepart: 1 }, 2026, 7),
    ).toBe('2026-0007');
  });

  it('séquence : départ si rien d’émis, sinon le plus grand + 1 (remise à zéro par année via la clé)', () => {
    expect(prochaineSequence(null, 1)).toBe(1);
    expect(prochaineSequence(null, 120)).toBe(120);
    expect(prochaineSequence(41, 1)).toBe(42);
  });

  it('verrouillé pour l’année dès une vraie facture ; règles de saisie', () => {
    const f = { prefixe: 'GC', formatAnnee: 'AAAA' as const, separateur: '-', chiffres: 4, numeroDepart: 1 };
    expect(refusFormat(f, false, 2026)).toBeNull();
    expect(refusFormat(f, true, 2026)).toMatch(/verrouillé pour 2026/);
    expect(refusFormat({ ...f, prefixe: 'G C' }, false, 2026)).toMatch(/Préfixe/);
    expect(refusFormat({ ...f, chiffres: 3, numeroDepart: 1000 }, false, 2026)).toMatch(/de 1 à 999/);
  });
});
