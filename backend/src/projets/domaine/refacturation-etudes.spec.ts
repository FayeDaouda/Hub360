import { montantRefacture, statutReglementBureau } from './refacturation-etudes';

describe('montantRefacture — coordination 10 % dans la ligne', () => {
  it('bureau × 1,10, arrondi au franc', () => {
    expect(montantRefacture(1_000_000)).toBe(1_100_000);
    expect(montantRefacture(333_333)).toBe(366_666);
  });
});

describe('statutReglementBureau — le bureau se règle après encaissement du client', () => {
  it('pas de facture active → non refacturé', () => {
    expect(statutReglementBureau({ bureauRegleLe: null, factureActive: null })).toBe('non_refacture');
  });
  it.each(['brouillon', 'emise', 'partiellement_payee', 'en_retard'])(
    'facture %s → en attente d’encaissement (un acompte ne suffit pas)',
    (s) => {
      expect(statutReglementBureau({ bureauRegleLe: null, factureActive: s })).toBe('en_attente_encaissement');
    },
  );
  it('facture soldée → à régler', () => {
    expect(statutReglementBureau({ bureauRegleLe: null, factureActive: 'payee' })).toBe('a_regler');
  });
  it('règlement saisi → réglé', () => {
    expect(statutReglementBureau({ bureauRegleLe: new Date(), factureActive: 'payee' })).toBe('regle');
  });
});
