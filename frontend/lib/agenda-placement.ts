// Placement d'une fenêtre ancrée à un élément de l'Agenda (18/11/2026), comme
// les fiches de Google Agenda : à droite du rendez-vous s'il y a la place,
// sinon à gauche, sinon centrée ; toujours entière à l'écran. Pur, testé.

export type Rect = { top: number; left: number; right: number; bottom: number };
// Le rectangle d'un élément cliqué (l'ancre d'une fenêtre).
export const rectDe = (r: DOMRect): Rect => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });
export type Taille = { largeur: number; hauteur: number };

export const MARGE_PX = 12;

export function placerFenetre(
  ancre: Rect,
  fenetre: Taille,
  ecran: Taille,
  marge = MARGE_PX,
): { top: number; left: number } {
  const tient = (left: number) => left >= marge && left + fenetre.largeur <= ecran.largeur - marge;
  const aDroite = ancre.right + marge;
  const aGauche = ancre.left - marge - fenetre.largeur;
  const left = tient(aDroite)
    ? aDroite
    : tient(aGauche)
      ? aGauche
      : Math.max(marge, Math.min((ecran.largeur - fenetre.largeur) / 2, ecran.largeur - fenetre.largeur - marge));
  // À la hauteur du haut de l'ancre, ramenée dans l'écran.
  const top = Math.max(marge, Math.min(ancre.top, ecran.hauteur - fenetre.hauteur - marge));
  return { top: Math.round(top), left: Math.round(left) };
}
