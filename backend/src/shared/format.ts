// Montants et nombres, en français : le franc CFA (XOF), sans centimes. Même
// rendu que frontend/lib/format.ts, jusqu'au paquet partagé prévu en S0c.
const CURRENCY = 'FCFA';

const number = new Intl.NumberFormat('fr-FR');

/** « 1 770 000 FCFA » (arrondi au franc). */
export function formatAmount(value: number): string {
  return `${number.format(Math.round(value))} ${CURRENCY}`;
}
