// Montant en toutes lettres (« Arrêtée la présente facture à la somme de… »),
// usage courant au Sénégal. Orthographe traditionnelle : traits d'union sous
// cent, « vingts » et « cents » au pluriel seulement en fin de nombre, « mille »
// invariable. Le franc CFA n'a pas de centimes.

const UNITES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function sousCent(n: number): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? 'soixante' : 'quatre-vingt';
    return `${base}${d === 7 && u === 1 ? ' et ' : '-'}${sousCent(10 + u)}`;
  }
  if (d === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
}

// 0 à 999 ; `finale` : « cents » / « quatre-vingts » prennent le s seulement
// en fin de nombre (pas devant « mille »).
function sousMille(n: number, finale: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let texte = '';
  if (c > 0) texte = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && finale ? 's' : ''}`;
  if (r > 0) {
    let fin = sousCent(r);
    if (!finale && fin === 'quatre-vingts') fin = 'quatre-vingt';
    texte = texte ? `${texte} ${fin}` : fin;
  }
  return texte;
}

export function nombreEnLettres(valeur: number): string {
  let n = Math.round(Math.abs(valeur));
  if (n === 0) return 'zéro';
  const parties: string[] = [];
  const echelles: [number, string, string][] = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  for (const [taille, un, plusieurs] of echelles) {
    const q = Math.floor(n / taille);
    if (q > 0) {
      parties.push(`${sousMille(q, true)} ${q > 1 ? plusieurs : un}`);
      n %= taille;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers > 0) parties.push(milliers === 1 ? 'mille' : `${sousMille(milliers, false)} mille`);
  const reste = n % 1000;
  if (reste > 0) parties.push(sousMille(reste, true));
  return parties.join(' ');
}

export const montantEnLettres = (valeur: number) => `${nombreEnLettres(valeur)} francs CFA`;
