// Fiche d'un dossier modifiée APRÈS sa soumission au CFO (09/11/2026) — par
// qui a l'Écriture de « Modifier une fiche figée » (matrice des droits).
// Fonctions pures : CrmService.modifierFiche les applique.
//
//   · Les champs qui fixent le prix de l'offre (catégorie → tarif CO,
//     surface × planches → quantité de la ligne de conception) ne bougent
//     pas : on passe par « Refaire une offre » ou un renvoi du CFO. La forme
//     bâtie non plus : elle désigne l'ouvrage sur les factures émises.
//   · Chaque modification est tracée dans l'historique ; des enregistrements
//     rapprochés de la même personne (la fiche s'enregistre champ par champ)
//     se regroupent sur une seule ligne.

export const MESSAGE_PRIX_FIGE =
  'figé après la soumission (prix de l’offre, désignation sur les factures) : passer par « Refaire une offre » ou un renvoi du CFO pour le changer.';

export const PREFIXE_TRACE = 'Fiche modifiée après soumission : ';

// Fenêtre de regroupement des lignes d'historique (même auteur).
export const FENETRE_TRACE_MS = 30 * 60 * 1000;

type Prix = { categorie: string | null; surfaceTerrain: number; nbPlanches: number };

// Champs du prix demandés à une autre valeur que l'actuelle (undefined = pas
// demandé). Les planches sont celles qui s'enregistreraient (saisies, ou
// recalculées depuis la fiche Programme).
export function champsPrixModifies(actuel: Prix, demande: Partial<Prix>): string[] {
  const champs: string[] = [];
  if (demande.categorie !== undefined && demande.categorie !== actuel.categorie) champs.push('Catégorie');
  if (demande.surfaceTerrain !== undefined && demande.surfaceTerrain !== actuel.surfaceTerrain) {
    champs.push('Surface du terrain');
  }
  if (demande.nbPlanches !== undefined && demande.nbPlanches !== actuel.nbPlanches) champs.push('Nombre de planches');
  return champs;
}

export function messagePrixFige(champs: string[]): string {
  return `${champs.join(', ')} : ${MESSAGE_PRIX_FIGE}`;
}

type Libres = { standing: string | null; gamme: string | null; ficheProgramme: unknown };

// Champs libres réellement changés, pour la trace et la notification.
export function champsLibresModifies(actuel: Libres, demande: Partial<Libres>): string[] {
  const champs: string[] = [];
  if (demande.ficheProgramme !== undefined && !memeValeur(demande.ficheProgramme, actuel.ficheProgramme)) {
    champs.push('fiche Programme');
  }
  if (demande.standing !== undefined && demande.standing !== actuel.standing) champs.push('standing');
  if (demande.gamme !== undefined && demande.gamme !== actuel.gamme) champs.push('gamme');
  return champs;
}

// Égalité de deux fiches Programme (JSON normalisé : l'ordre des clés ne compte pas).
function memeValeur(a: unknown, b: unknown): boolean {
  return JSON.stringify(trier(a)) === JSON.stringify(trier(b ?? null));
}
function trier(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(trier);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, val]) => [k, trier(val)]),
    );
  }
  return v;
}

export function commentaireTrace(champs: string[]): string {
  return `${PREFIXE_TRACE}${champs.join(', ')}`;
}

// Ligne d'historique à compléter plutôt qu'en créer une : la dernière du
// dossier, du même auteur, une trace de fiche figée, dans la fenêtre.
export function traceARegrouper(
  derniere: { parId: string | null; commentaire: string | null; creeLe: Date } | null,
  auteurId: string,
  maintenant: Date,
): boolean {
  return (
    !!derniere &&
    derniere.parId === auteurId &&
    !!derniere.commentaire?.startsWith(PREFIXE_TRACE) &&
    maintenant.getTime() - derniere.creeLe.getTime() < FENETRE_TRACE_MS
  );
}

// Champs d'une trace existante + nouveaux, sans doublon, dans l'ordre d'arrivée.
export function fusionnerTrace(commentaire: string, champs: string[]): string {
  const deja = commentaire.slice(PREFIXE_TRACE.length).split(', ').filter(Boolean);
  return commentaireTrace([...new Set([...deja, ...champs])]);
}
