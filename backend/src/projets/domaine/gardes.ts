import { FactureStatut } from '@prisma/client';
import { daysBetween } from '@hub/domain';

// -- Section « Facturation client » ----------------------------------------

// Statut effectif d'une facture : le statut stocké (cycle admin) enrichi de
// l'état de paiement, calculé à la lecture. Pas de valeur Prisma dédiée — il
// n'est jamais persisté.
export type StatutFactureEffectif = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'en_retard' | 'annulee';

// HT d'une ligne de devis, remise de l'offre appliquée (09/11/2026) — LE
// calcul de tout montant de devis (offre, échéancier, factures de l'Onboard,
// contrat, seuils, pipeline, commissions) : arrondi au franc par ligne.
export function htLigne(quantite: number, prixUnitaire: number, remisePct: number | null): number {
  const brut = quantite * prixUnitaire;
  return Math.round(remisePct ? (brut * (100 - remisePct)) / 100 : brut);
}

// GARDE MIROIR de frontend/lib/types.ts::ventilationTva
// FCFA sans décimale : la TVA est arrondie au franc. montantHt + tauxTva sont
// les seules données stockées ; TVA et TTC en découlent — et restent figées de
// fait une fois la facture émise (montantHt/tauxTva non modifiables).
export function ventilationTva(montantHt: number, tauxTva: number): { montantTva: number; montantTtc: number } {
  const montantTva = Math.round((montantHt * tauxTva) / 100);
  return { montantTva, montantTtc: montantHt + montantTva };
}

// GARDE MIROIR de frontend/lib/types.ts::statutFactureEffectif
// Le statut stocké ne connaît que le cycle piloté par l'admin (brouillon →
// emise → annulee). « payée / partiellement payée / en retard » se déduisent du
// cumul des paiements et de l'échéance — aucun job planifié, comme les alertes
// d'échéance permis / avant-projet. Priorités : soldée l'emporte sur en retard
// (payer en retard reste payer) ; en retard l'emporte sur partiellement payée.
export function statutFactureEffectif(
  f: {
    statut: FactureStatut;
    echeanceLe: string | null;
    montantTtc: number;
    montantPaye: number;
  },
  aujourdhui: string, // AAAA-MM-JJ
): StatutFactureEffectif {
  if (f.statut !== 'emise') return f.statut; // brouillon | annulee
  if (f.montantPaye >= f.montantTtc) return 'payee';
  if (f.echeanceLe && f.echeanceLe < aujourdhui) return 'en_retard';
  if (f.montantPaye > 0) return 'partiellement_payee';
  return 'emise';
}

// Jours de retard d'une facture échue et non soldée (0 sinon). Comparaison de
// dates AAAA-MM-JJ en UTC pour éviter tout décalage de fuseau.
export function joursRetardFacture(echeanceLe: string | null, aujourdhui: string): number {
  if (!echeanceLe || echeanceLe >= aujourdhui) return 0;
  const jours = daysBetween(echeanceLe, aujourdhui);
  return jours > 0 ? jours : 0;
}
