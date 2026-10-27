// Montants et nombres, en français. La devise de Grey Concrete est le franc
// CFA (XOF), sans centimes ; si une autre société utilise une autre devise,
// c'est le seul endroit à adapter (ou à rendre paramétrable par société).
// Les dates sont dans dates.ts.
const CURRENCY = 'FCFA';

const number = new Intl.NumberFormat('fr-FR');
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 });
const hours = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 1 770 000 FCFA » (arrondi au franc). */
export function formatAmount(value: number): string {
  return `${number.format(Math.round(value))} ${CURRENCY}`;
}

/** « 1,77 M FCFA ». */
export function formatCompactAmount(value: number): string {
  return `${compact.format(value)} ${CURRENCY}`;
}

/** « 1 770 000 ». */
export function formatNumber(value: number): string {
  return number.format(value);
}

/** « 12,5 h » : des heures, une décimale au plus. */
export function formatHours(value: number): string {
  return `${hours.format(value)} h`;
}
