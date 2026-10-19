// Photo de la fiche d'équipe, sinon les initiales (Mon espace, Ma cellule).
export function Avatar({ nom, photo, taille = 'md' }: { nom: string; photo: string | null; taille?: 'sm' | 'md' }) {
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join('')
    .toUpperCase();
  return photo ? (
    // data URI de la fiche d'équipe : pas d'optimisation next/image utile.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`mes-initiales mes-initiales--${taille} mes-photo`} src={photo} alt="" />
  ) : (
    <span className={`mes-initiales mes-initiales--${taille}`} aria-hidden>
      {initiales}
    </span>
  );
}
