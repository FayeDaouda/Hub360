import { couleurPersonne, initialesDe, srcPhoto } from '@/lib/profil';

// Avatar d'une personne : sa photo, sinon ses initiales sur sa couleur
// (stable, propre à la personne). `absent` : pastille « absent » (absence
// validée par la RH qui couvre aujourd'hui).
export function AvatarPersonne({
  nom,
  photo,
  cle,
  taille = 'md',
  absent = false,
  className,
}: {
  nom: string;
  photo?: string | null;
  cle?: string; // identifiant stable pour la couleur (id), à défaut le nom
  taille?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  absent?: boolean;
  className?: string;
}) {
  const src = srcPhoto(photo);
  return (
    <span
      className={`av av--${taille}${className ? ` ${className}` : ''}`}
      style={src ? undefined : { background: couleurPersonne(cle ?? nom) }}
      aria-hidden
    >
      {src ? (
        // Photo déjà réduite à 256 px : pas d'optimisation next/image utile.
        <img src={src} alt="" />
      ) : (
        initialesDe(nom)
      )}
      {absent && <span className="av-absent" />}
    </span>
  );
}
