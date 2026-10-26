// Petits traitements de texte communs.

/** Sans accents ni diacritiques : « Équipe » → « Equipe ». */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** « 1 facture », « 3 factures » (pluriel régulier en « s »). */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

/** Texte sûr dans du HTML (contenu des e-mails). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
