// Nomenclature du code dossier / projet — règle Grey Concrete, validée par le
// boss (sept. 2026).
//
//   Format : XX_YY.ZZ  (+ suffixe « V2 », « V3 »… en cas de doublon)
//     XX  client particulier      → initiale de chaque mot du nom (2 lettres)
//         client entreprise / SCI → 2 premières lettres du nom
//     YY  initiale de chaque mot du quartier (partie avant la 1ʳᵉ virgule)
//     ZZ  2 derniers chiffres de l'année de création
//
// MIROIR de backend/src/crm/nomenclature.ts — `genererCodeDossier` doit rester
// identique des deux côtés (aperçu du champ « code » dans le formulaire). La
// gestion des doublons (V2/V3) est faite par le serveur à la création.

function motsSignificatifs(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s\-'’.]+/)
    .filter(Boolean);
}

function segmentClient(nom: string, type: string): string {
  const mots = motsSignificatifs(nom);
  if (type === 'particulier') {
    const initiales = mots.map((m) => m[0]).join('');
    const base = initiales.length >= 2 ? initiales : mots[0] ?? '';
    return (base.slice(0, 2) || 'XX').toUpperCase();
  }
  return (mots.join('').slice(0, 2) || 'XX').toUpperCase();
}

function segmentLieu(localisation: string): string {
  const quartier = localisation.split(',')[0] ?? localisation;
  const init = motsSignificatifs(quartier)
    .map((m) => m[0])
    .join('')
    .toUpperCase();
  return init || 'X';
}

// Renvoie le code de base (sans suffixe de doublon). Chaîne vide si les
// informations minimales manquent — le formulaire n'affiche alors pas d'aperçu.
export function genererCodeDossier(
  client: { nom: string; type: string },
  localisation: string,
  date: Date = new Date(),
): string {
  if (!client.nom.trim() || !localisation.trim()) return '';
  const xx = segmentClient(client.nom, client.type);
  const yy = segmentLieu(localisation);
  const zz = String(date.getFullYear()).slice(-2);
  return `${xx}_${yy}.${zz}`;
}
