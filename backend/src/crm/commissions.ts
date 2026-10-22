// Commissions des apporteurs (revue COO, 22/10/2026) — règles pures.
// Mode par défaut (CFO) : taux × honoraires HT encaissés, due à chaque
// encaissement au prorata ; autre mode : taux × honoraires HT du contrat
// signé, due à la signature. Le mode est celui en vigueur à la signature du
// dossier. Les ventes (promotion interne) ne sont pas des honoraires.

import type { ModeCommission } from '@prisma/client';

export type EncaissementHonoraires = {
  paiementId: string;
  date: string; // AAAA-MM-JJ
  montantTtc: number;
  factureHt: number;
  factureTtc: number;
};

export type CommissionAttendue = {
  cle: string;
  paiementId: string | null;
  baseHt: number;
  montant: number;
  exigibleLe: string;
};

// Part HT d'un encaissement : au prorata HT / TTC de la facture réglée.
export const partHt = (e: Pick<EncaissementHonoraires, 'montantTtc' | 'factureHt' | 'factureTtc'>) =>
  e.factureTtc > 0 ? Math.round((e.montantTtc * e.factureHt) / e.factureTtc) : 0;

export const montantCommission = (baseHt: number, taux: number) => Math.round((baseHt * taux) / 100);

export function commissionsAttendues(
  dossier: { id: string; taux: number; signeLe: string; signeHt: number | null },
  mode: ModeCommission,
  encaissements: EncaissementHonoraires[],
): CommissionAttendue[] {
  if (mode === 'signature_contrat') {
    if (!dossier.signeHt) return [];
    return [{ cle: `signature:${dossier.id}`, paiementId: null, baseHt: dossier.signeHt, montant: montantCommission(dossier.signeHt, dossier.taux), exigibleLe: dossier.signeLe }];
  }
  return encaissements
    .map((e) => ({ e, baseHt: partHt(e) }))
    .filter(({ baseHt }) => baseHt > 0)
    .map(({ e, baseHt }) => ({ cle: `paiement:${e.paiementId}`, paiementId: e.paiementId, baseHt, montant: montantCommission(baseHt, dossier.taux), exigibleLe: e.date }));
}

// Mode en vigueur à une date : la dernière version du profil de facturation
// créée au plus tard ce jour-là ; avant toute version, le mode par défaut.
export function modeA(versions: { modeCommission: ModeCommission; jour: string }[], jour: string): ModeCommission {
  const enVigueur = versions.filter((v) => v.jour <= jour).sort((a, b) => a.jour.localeCompare(b.jour)).at(-1);
  return enVigueur?.modeCommission ?? 'encaisse_prorata';
}
