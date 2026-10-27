import { addDays } from '@hub/domain';
// Facture directe d'un lead (maquette Finances, oct. 2026) : lignes libres,
// TVA par défaut, préparée « à valider par le CFO avant émission » ; payable à
// 15 jours (pied de facture de la maquette). Règles pures, testées.

export const DELAI_PAIEMENT_DIRECTE_JOURS = 15;
export const LIGNES_MAX = 20;

export type LigneSaisie = { designation: string; montantHt: number };

export class ErreurFactureDirecte extends Error {}

// Lignes nettoyées : désignation obligatoire, montant entier positif (FCFA).
export function lignesFactureDirecte(lignes: LigneSaisie[]): LigneSaisie[] {
  if (!lignes.length) throw new ErreurFactureDirecte('Renseignez au moins une ligne avec un montant.');
  if (lignes.length > LIGNES_MAX) throw new ErreurFactureDirecte(`${LIGNES_MAX} lignes au plus.`);
  return lignes.map((l, i) => {
    const designation = l.designation.trim();
    if (!designation) throw new ErreurFactureDirecte(`Ligne ${i + 1} : désignation manquante.`);
    if (!Number.isInteger(l.montantHt) || l.montantHt < 1) {
      throw new ErreurFactureDirecte(`Ligne ${i + 1} : montant HT entier positif attendu (FCFA).`);
    }
    return { designation, montantHt: l.montantHt };
  });
}

// Échéance d'une facture directe émise le `jour` (AAAA-MM-JJ, jours calendaires).
export function echeanceDirecte(jour: string): string {
  return addDays(jour, DELAI_PAIEMENT_DIRECTE_JOURS);
}
