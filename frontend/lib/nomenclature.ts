// Nomenclature du code dossier / projet — règle Grey Concrete v2, validée
// (étape B de l'intégration CRM, sept. 2026).
//
//   Format : CLIENT_LOC.AA  (+ suffixe « -2 », « -3 »… en cas de doublon)
//     CLIENT  particulier            → 1ʳᵉ lettre de chaque mot du nom, dans
//                                      l'ordre saisi (état civil), sans plafond,
//                                      titres et « et » ignorés ; s'il ne reste
//                                      qu'un mot → ses 3 premières lettres
//             sci / entreprise /     → sigle de la fiche client, tel que
//             institution              l'entreprise l'a choisi (jamais dérivé)
//     LOC     code 3 lettres de la localité du référentiel
//     AA      2 derniers chiffres de l'année de création
//
//   Exemples : Daouda Faye Sow · Almadies · 2026      → DFS_ALM.26
//              M. et Mme Diouf · Ngor                 → DIO_NGO.26
//              Teranga Capital (sigle TC) · Point E  → TC_POI.26
//              2ᵉ dossier identique                   → DFS_ALM.26-2
//
// MIROIR de backend/src/crm/nomenclature.ts — garder les deux fichiers
// identiques (l'aperçu du code côté formulaire). `codeAvecVariante` sert
// aux deux : côté serveur avec les codes pris en base.

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Découpe un nom en mots : sépare sur espaces, tirets, apostrophes et points,
// retire les accents, jette les vides.
function mots(s: string): string[] {
  return sansAccents(s)
    .split(/[\s\-'’.]+/)
    .filter(Boolean);
}

// Titres de civilité et conjonctions ignorés dans le nom d'un particulier
// (liste validée, sept. 2026) — comparés sans accents, en minuscules, point
// retiré : « M. et Mme Diouf » → Diouf, « Dr Fatou Sarr » → Fatou Sarr.
const MOTS_IGNORES = new Set([
  "m",
  "mme",
  "mlle",
  "dr",
  "me",
  "pr",
  "et",
  "&",
  "monsieur",
  "madame",
  "mademoiselle",
  "docteur",
  "maitre",
  "famille",
]);

// Sigle tel qu'il est stocké et utilisé : majuscules, lettres et chiffres
// seulement (« S.N.F » → SNF, « Téranga » → TERANGA). Chaîne vide si rien.
export function normaliserSigle(sigle: string): string {
  return sansAccents(sigle)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function estPersonneMorale(type: string): boolean {
  return type !== "particulier";
}

// Segment CLIENT. Chaîne vide si l'information manque (nom vide, ou sigle
// absent pour une personne morale) — l'appelant décide quoi en faire.
function segmentClient(client: {
  nom: string;
  type: string;
  sigle?: string | null;
}): string {
  if (estPersonneMorale(client.type))
    return normaliserSigle(client.sigle ?? "");
  const tous = mots(client.nom);
  const utiles = tous.filter((m) => !MOTS_IGNORES.has(m.toLowerCase()));
  // Nom fait uniquement de mots ignorés (« Monsieur ») : on garde tout
  // plutôt que de bloquer la création.
  const retenus = utiles.length > 0 ? utiles : tous;
  // Un seul mot → ses 3 premières lettres (une initiale seule est trop
  // courte, trop de collisions) ; sinon 1ʳᵉ lettre de chaque mot.
  const segment =
    retenus.length === 1
      ? retenus[0].slice(0, 3)
      : retenus.map((m) => m[0]).join("");
  return segment.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Code de base (sans suffixe de doublon). Chaîne vide si une information
// manque : le formulaire n'affiche pas d'aperçu, le serveur refuse (400).
export function genererCodeDossier(
  client: { nom: string; type: string; sigle?: string | null },
  codeLocalite: string,
  date: Date = new Date(),
): string {
  const segClient = segmentClient(client);
  if (!segClient || !codeLocalite) return "";
  const aa = String(date.getFullYear()).slice(-2);
  return `${segClient}_${codeLocalite}.${aa}`;
}

// Ajoute « -2 », « -3 »… tant que `base` (ou une variante) est déjà pris.
export function codeAvecVariante(base: string, pris: Set<string>): string {
  if (!pris.has(base)) return base;
  let n = 2;
  while (pris.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
