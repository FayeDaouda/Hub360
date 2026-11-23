import { describe, expect, it } from 'vitest';
import { produitsPrincipaux } from './finances';
import type { Devis, FactureCentrale, ProduitService } from './types';

// Tableau de bord Finances · produits principaux : une tranche d'offre se
// ventile sur les lignes de l'offre au prorata de leur HT. Remise de l'offre
// (09/11/2026) : prorata sur le HT remisé des lignes, sinon le facturé gonfle.

const MAINTENANT = new Date('2026-11-09T12:00:00Z');

const produit = (id: string, code: string): ProduitService =>
  ({ id, code, designation: `${code} — prestation` }) as unknown as ProduitService;

const ligne = (id: string, produitServiceId: string, brut: number, remise: number) => ({
  id,
  produitServiceId,
  designation: produitServiceId,
  montantHt: brut,
  montantHtRemise: remise,
});

// Offre remisée de 20 % : 1 000 000 + 250 000 brut → 800 000 + 200 000 remisé.
const OFFRE = {
  id: 'of-1',
  remisePct: 20,
  montantBrutHt: 1_250_000,
  montantRemise: 250_000,
  montantHt: 1_000_000,
  lignes: [ligne('l-co', 'p-co', 1_000_000, 800_000), ligne('l-pc', 'p-pc', 250_000, 200_000)],
} as unknown as Devis;

// Tranche émise de 500 000 HT (la moitié de l'offre remisée), entièrement payée.
const TRANCHE = {
  id: 'f-1',
  statut: 'emise',
  statutEffectif: 'payee',
  estAvoir: false,
  emiseLe: '2026-11-01T10:00:00Z',
  montantHt: 500_000,
  montantTtc: 590_000,
  montantPaye: 590_000,
  devisEcheancierId: 'of-1',
  devisOrigineId: null,
  ligneDevisId: null,
  factureOrigineId: null,
} as unknown as FactureCentrale;

describe('produitsPrincipaux · offre remisée', () => {
  it('ventile une tranche au prorata du HT remisé, sans gonfler le facturé', () => {
    const barres = produitsPrincipaux(
      [TRANCHE],
      [OFFRE],
      [produit('p-co', 'CO2'), produit('p-pc', 'DPC')],
      5,
      MAINTENANT,
    );
    const total = barres.reduce((s, b) => s + b.facture, 0);
    expect(total).toBe(500_000);
    expect(barres.find((b) => b.cle === 'CO2')?.facture).toBe(400_000);
    expect(barres.find((b) => b.cle === 'DPC')?.facture).toBe(100_000);
  });
});
