import { stripAccents } from './text';
import { yearOf } from './dates';
// Nomenclature du code dossier / projet — règle Grey Concrete v2, validée
// (étape B de l'intégration CRM, sept. 2026).
//
//   Format : CLIENT_LOC.AA  (+ suffixe « -2 », « -3 »… en cas de doublon)
//     CLIENT  particulier            → 1ʳᵉ lettre de chaque mot du nom, dans
//                                      l'ordre saisi (état civil), sans plafond,
//                                      titres et « et » ignorés ; s'il ne reste
//                                      qu'un mot → ses 3 premières lettres
//             personne morale        → initiales de la raison sociale, formes
//             (sci / entreprise /      juridiques (SA, SARL…) et mots de liaison
//             institution)             ignorés ; un seul mot → ses 3 premières
//                                      lettres (maquette « Nouveau projet »,
//                                      oct. 2026). Un client antérieur qui a un
//                                      sigle garde ce sigle : ses codes restent
//                                      cohérents d'un projet à l'autre.
//     LOC     code 3 lettres de la localité du référentiel
//     AA      2 derniers chiffres de l'année de création
//
//   Exemples : Daouda Faye Sow · Almadies · 2026      → DFS_ALM.26
//              M. et Mme Diouf · Ngor                 → DIO_NGO.26
//              Teranga Capital (sigle TC) · Point E  → TC_POI.26
//              SCI Les Filaos · Almadies              → FIL_ALM.26
//              2ᵉ dossier identique                   → DFS_ALM.26-2
//
// MIROIR de backend/src/crm/nomenclature.ts — garder les deux fichiers
// identiques (l'aperçu du code côté formulaire). `codeAvecVariante` sert
// aux deux : côté serveur avec les codes pris en base.

// Découpe un nom en mots : sépare sur espaces, tirets, apostrophes et points,
// retire les accents, jette les vides.
function mots(s: string): string[] {
  return stripAccents(s)
    .split(/[\s\-'’.]+/)
    .filter(Boolean);
}

// Titres de civilité et conjonctions ignorés dans le nom d'un particulier
// (liste validée, sept. 2026) — comparés sans accents, en minuscules, point
// retiré : « M. et Mme Diouf » → Diouf, « Dr Fatou Sarr » → Fatou Sarr.
const MOTS_IGNORES = new Set([
  'm',
  'mme',
  'mlle',
  'dr',
  'me',
  'pr',
  'et',
  '&',
  'monsieur',
  'madame',
  'mademoiselle',
  'docteur',
  'maitre',
  'famille',
]);

// Sigle tel qu'il est stocké et utilisé : majuscules, lettres et chiffres
// seulement (« S.N.F » → SNF, « Téranga » → TERANGA). Chaîne vide si rien.
export function normaliserSigle(sigle: string): string {
  return stripAccents(sigle)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function estPersonneMorale(type: string): boolean {
  return type !== 'particulier';
}

// Formes juridiques (OHADA et usuelles) et mots de liaison ignorés dans une
// raison sociale — comparés sans accents, en minuscules, points retirés :
// « SCI Les Filaos » → Filaos, « S.A.R.L. Teranga Capital » → Teranga Capital.
const FORMES_JURIDIQUES = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'suarl',
  'eurl',
  'snc',
  'scs',
  'sci',
  'scp',
  'gie',
  'scoops',
]);

const MOTS_LIAISON = new Set([
  'le',
  'la',
  'les',
  'l',
  'de',
  'du',
  'des',
  'd',
  'et',
  '&',
  'en',
  'au',
  'aux',
  'a',
  'un',
  'une',
  'pour',
  'sur',
]);

// Un seul mot → ses 3 premières lettres (une initiale seule est trop courte,
// trop de collisions) ; sinon 1ʳᵉ lettre de chaque mot.
function initiales(retenus: string[]): string {
  const segment = retenus.length === 1 ? retenus[0].slice(0, 3) : retenus.map((m) => m[0]).join('');
  return segment.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Raison sociale : les points tombent d'abord (« S.A.R.L. » → SARL, une
// seule forme juridique et non quatre initiales), puis tout ce qui n'est ni
// lettre, ni chiffre, ni « & » sépare les mots.
function segmentRaisonSociale(nom: string): string {
  const tous = stripAccents(nom)
    .replace(/\./g, '')
    .split(/[^A-Za-z0-9&]+/)
    .filter(Boolean);
  const utiles = tous.filter((m) => {
    const mot = m.toLowerCase();
    return !FORMES_JURIDIQUES.has(mot) && !MOTS_LIAISON.has(mot);
  });
  // Raison sociale faite uniquement de mots ignorés (« SARL ») : on garde
  // tout plutôt que de bloquer la création.
  return initiales(utiles.length > 0 ? utiles : tous);
}

// Segment CLIENT. Chaîne vide si le nom manque — l'appelant décide quoi en
// faire (l'aperçu de la modale affiche « ??? » à sa place).
export function segmentClient(client: { nom: string; type: string; sigle?: string | null }): string {
  if (estPersonneMorale(client.type)) {
    // Client antérieur à la maquette : son sigle reste son segment.
    return normaliserSigle(client.sigle ?? '') || segmentRaisonSociale(client.nom);
  }
  const tous = mots(client.nom);
  const utiles = tous.filter((m) => !MOTS_IGNORES.has(m.toLowerCase()));
  // Nom fait uniquement de mots ignorés (« Monsieur ») : on garde tout
  // plutôt que de bloquer la création.
  return initiales(utiles.length > 0 ? utiles : tous);
}

// Code de base (sans suffixe de doublon). Chaîne vide si une information
// manque : le formulaire n'affiche pas d'aperçu, le serveur refuse (400).
export function genererCodeDossier(
  client: { nom: string; type: string; sigle?: string | null },
  codeLocalite: string,
  date: Date = new Date(),
): string {
  const segClient = segmentClient(client);
  if (!segClient || !codeLocalite) return '';
  const aa = String(yearOf(date)).slice(-2);
  return `${segClient}_${codeLocalite}.${aa}`;
}

// Ajoute « -2 », « -3 »… tant que `base` (ou une variante) est déjà pris.
export function codeAvecVariante(base: string, pris: Set<string>): string {
  if (!pris.has(base)) return base;
  let n = 2;
  while (pris.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
