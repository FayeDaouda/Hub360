// Nomenclature du code dossier / projet — règle Grey Concrete, validée par le
// boss (sept. 2026).
//
//   Format : XX_YY.ZZ  (+ suffixe « V2 », « V3 »… en cas de doublon)
//     XX  client particulier      → initiale de chaque mot du nom (2 lettres)
//         client entreprise / SCI → 2 premières lettres du nom
//     YY  initiale de chaque mot du quartier (partie avant la 1ʳᵉ virgule)
//     ZZ  2 derniers chiffres de l'année de création
//
//   Exemples : Daouda Faye · Point E · 2026        → DF_PE.26
//              Teranga Capital · Almadies · 2026   → TE_A.26
//              … · Sacré-Cœur · 2026               → …_SC.26
//
// MIROIR de frontend/lib/nomenclature.ts — garder les deux fichiers identiques
// pour la fonction `genererCodeDossier` (l'aperçu du champ « code » côté front).
// `codeAvecVariante` (gestion des doublons) reste côté serveur : elle a besoin
// de la base.

// Découpe une chaîne en mots « significatifs » : sépare sur espaces, tirets,
// apostrophes et points, retire les accents, jette les vides.
function motsSignificatifs(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s\-'’.]+/)
    .filter(Boolean);
}

// Segment XX — dépend du type de client.
function segmentClient(nom: string, type: string): string {
  const mots = motsSignificatifs(nom);
  if (type === 'particulier') {
    const initiales = mots.map((m) => m[0]).join('');
    // ≥ 2 mots → initiales ; 1 seul mot → ses 2 premières lettres.
    const base = initiales.length >= 2 ? initiales : mots[0] ?? '';
    return (base.slice(0, 2) || 'XX').toUpperCase();
  }
  // entreprise / sci / institution → 2 premières lettres du nom compacté.
  return (mots.join('').slice(0, 2) || 'XX').toUpperCase();
}

// Segment YY — initiale de chaque mot du quartier (avant la 1ʳᵉ virgule).
function segmentLieu(localisation: string): string {
  const quartier = localisation.split(',')[0] ?? localisation;
  const init = motsSignificatifs(quartier)
    .map((m) => m[0])
    .join('')
    .toUpperCase();
  return init || 'X';
}

export function genererCodeDossier(
  client: { nom: string; type: string },
  localisation: string,
  date: Date = new Date(),
): string {
  const xx = segmentClient(client.nom, client.type);
  const yy = segmentLieu(localisation);
  const zz = String(date.getFullYear()).slice(-2);
  return `${xx}_${yy}.${zz}`;
}

// Ajoute « V2 », « V3 »… tant que `base` (ou une variante) est déjà pris.
export function codeAvecVariante(base: string, pris: Set<string>): string {
  if (!pris.has(base)) return base;
  let n = 2;
  while (pris.has(`${base} V${n}`)) n++;
  return `${base} V${n}`;
}
