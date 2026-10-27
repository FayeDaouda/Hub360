import { stripAccents } from '@hub/domain';
// Numérotation des factures (lot 6, à la manière de Zervant) — règles pures.
// Une séquence sans trou par préfixe et par année, commune aux factures et
// aux avoirs, attribuée à l'émission seulement ; elle repart au numéro de
// départ chaque nouvelle année. Le préfixe « TEST » marque la démo et la
// pré-production : il ne verrouille rien.

export type FormatAnnee = 'AAAA' | 'AA';
export type FormatNumero = {
  prefixe: string;
  formatAnnee: FormatAnnee;
  separateur: string;
  chiffres: number;
  numeroDepart: number;
};

export const PREFIXE_TEST = 'TEST';
export const SEPARATEURS = ['-', '/', '.', ''] as const;

// « Grey Concrete » → « GC » : le préfixe par défaut de la société.
export const initiales = (nom: string) =>
  stripAccents(nom)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((m) => m[0].toUpperCase())
    .join('')
    .slice(0, 6) || 'F';

export const formatParDefaut = (nomSociete: string): FormatNumero => ({
  prefixe: initiales(nomSociete),
  formatAnnee: 'AAAA',
  separateur: '-',
  chiffres: 4,
  numeroDepart: 1,
});

// « GC-2026-0001 » ; sans préfixe : « 2026-0001 ».
export function formaterNumero(f: FormatNumero, annee: number, sequence: number): string {
  const an = f.formatAnnee === 'AA' ? String(annee % 100).padStart(2, '0') : String(annee);
  return [f.prefixe, an, String(sequence).padStart(f.chiffres, '0')].filter(Boolean).join(f.separateur);
}

// Prochain numéro de la séquence (préfixe, année) : le plus grand + 1, ou le
// numéro de départ si la séquence n'a encore rien émis.
export const prochaineSequence = (dernier: number | null, numeroDepart: number) =>
  dernier === null ? numeroDepart : dernier + 1;

// Motif de refus d'un nouveau format, ou null. Une fois une vraie facture
// (préfixe ≠ TEST) émise dans l'année, le format est figé jusqu'au 1er
// janvier. Reprendre un préfixe déjà utilisé continue sa séquence (le plus
// grand + 1) : jamais deux fois le même numéro (contrainte unique en base).
export function refusFormat(f: FormatNumero, vraieFactureCetteAnnee: boolean, annee: number): string | null {
  if (!/^[A-Za-z0-9]{0,10}$/.test(f.prefixe)) return 'Préfixe : 10 lettres ou chiffres au plus, sans espace.';
  if (!['AAAA', 'AA'].includes(f.formatAnnee)) return 'Année sur 4 ou 2 chiffres.';
  if (!(SEPARATEURS as readonly string[]).includes(f.separateur)) return 'Séparateur : « - », « / », « . » ou aucun.';
  if (!Number.isInteger(f.chiffres) || f.chiffres < 3 || f.chiffres > 6) return 'Nombre de chiffres : de 3 à 6.';
  if (!Number.isInteger(f.numeroDepart) || f.numeroDepart < 1 || String(f.numeroDepart).length > f.chiffres) {
    return `Numéro de départ : de 1 à ${'9'.repeat(f.chiffres)}.`;
  }
  if (vraieFactureCetteAnnee)
    return `Le format est verrouillé pour ${annee} : une vraie facture a déjà été émise. Il pourra changer à partir du 1er janvier.`;
  return null;
}
