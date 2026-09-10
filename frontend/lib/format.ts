import type { FormatValeur } from './types';

// Formatage localisé (fr-FR). La devise de Grey Concrete est le franc CFA
// (XOF) ; si une autre société utilise une devise différente, c'est le seul
// endroit à adapter (ou à rendre paramétrable par société).
const DEVISE = 'FCFA';

const nombre = new Intl.NumberFormat('fr-FR');
const compact = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

export function formatMontant(valeur: number): string {
  return `${nombre.format(Math.round(valeur))} ${DEVISE}`;
}

export function formatMontantCompact(valeur: number): string {
  return `${compact.format(valeur)} ${DEVISE}`;
}

export function formatPourcent(valeur: number): string {
  return `${nombre.format(valeur)} %`;
}

export function formatNombre(valeur: number): string {
  return nombre.format(valeur);
}

export function formatSurface(valeur: number): string {
  return `${nombre.format(valeur)} m²`;
}

export function formatValeurKpi(valeur: number, format: FormatValeur): string {
  switch (format) {
    case 'montant':
      return formatMontant(valeur);
    case 'montant_compact':
      return formatMontantCompact(valeur);
    case 'pourcent':
      return formatPourcent(valeur);
    case 'nombre':
      return formatNombre(valeur);
    case 'surface':
      return formatSurface(valeur);
  }
}

// « − » (U+2212) plutôt que le trait d'union : même chasse que « + », meilleur
// alignement des colonnes de chiffres.
export function formatVariation(variation: number, unite: 'pourcent' | 'points'): string {
  const signe = variation > 0 ? '+' : variation < 0 ? '−' : '';
  const valeur = nombre.format(Math.abs(variation));
  return unite === 'points' ? `${signe}${valeur} pts` : `${signe}${valeur} %`;
}

export function formatDateCourte(iso: string): string {
  return dateCourte.format(new Date(iso));
}

// Écart de montant, sans unité (utilisé en colonne delta d'un tableau).
// « − » (U+2212) pour rester aligné avec « + ».
export function formatEcartMontant(valeur: number): string {
  const signe = valeur > 0 ? '+' : valeur < 0 ? '−' : '';
  return `${signe}${compact.format(Math.abs(valeur))}`;
}
