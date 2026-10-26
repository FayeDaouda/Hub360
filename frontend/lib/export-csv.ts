// Export d'une liste vers Excel : CSV au format attendu par Excel en
// français (séparateur « ; », virgule décimale, BOM UTF-8 pour les accents).
// Construit côté navigateur à partir des lignes déjà affichées — les filtres
// en cours sont donc respectés, sans nouvel appel serveur.

export type ColonneExport<T> = { titre: string; valeur: (ligne: T) => string | number | null | undefined };

function cellule(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  // Texte commençant par = + - @ : neutralisé (sinon Excel l'exécute comme formule).
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Date AAAA-MM-JJ (ou ISO) → JJ/MM/AAAA, reconnue comme date par Excel.
export const dateExport = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null;

export function exporterCsv<T>(nom: string, colonnes: ColonneExport<T>[], lignes: T[]) {
  const contenu = [
    colonnes.map((c) => cellule(c.titre)),
    ...lignes.map((l) => colonnes.map((c) => cellule(c.valeur(l)))),
  ]
    .map((ligne) => ligne.join(';'))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${contenu}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nom}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
