// Petits traitements de texte communs.

/** Sans accents ni diacritiques : « Équipe » → « Equipe ». */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** « 1 facture », « 3 factures » (pluriel régulier en « s »). */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

/** Première lettre en capitale : « octobre 2026 » → « Octobre 2026 ». */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
