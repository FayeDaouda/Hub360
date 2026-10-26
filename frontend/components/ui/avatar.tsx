import { couleurPersonne, initialesDe, srcPhoto } from '@/lib/profil';
import type { Societe } from '@/lib/types';
import { SocieteIcon } from '@/components/societe-icon';

// Avatar d'une personne : sa photo, sinon ses initiales sur sa couleur
// (stable, propre à la personne). `absent` : pastille « absent » (absence
// validée par la RH qui couvre aujourd'hui).
export function PersonAvatar({
  name,
  photo,
  colorKey,
  size = 'md',
  absent = false,
  className,
}: {
  name: string;
  photo?: string | null;
  colorKey?: string; // identifiant stable pour la couleur (id), à défaut le nom
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  absent?: boolean;
  className?: string;
}) {
  const src = srcPhoto(photo);
  return (
    <span
      className={`av av--${size}${className ? ` ${className}` : ''}`}
      style={src ? undefined : { background: couleurPersonne(colorKey ?? name) }}
      aria-hidden
    >
      {src ? (
        // Photo déjà réduite à 256 px : pas d'optimisation next/image utile.
        <img src={src} alt="" />
      ) : (
        initialesDe(name)
      )}
      {absent && <span className="av-absent" />}
    </span>
  );
}

// Avatar d'une société : son logo, sinon son icône ou son initiale sur sa
// couleur de marque — jamais une tuile vide.
export function CompanyAvatar({
  company,
  size = 'md',
  theme = 'light',
  alt,
}: {
  company: Pick<Societe, 'nom' | 'logoUrl' | 'logoUrlSombre' | 'couleurMarque' | 'icone'>;
  size?: 'md' | 'lg' | 'xl';
  // 'glass' : posé sur la carte vitrée de l'écran de login (au-dessus d'une
  // photo) — pas de tuile, juste une ombre portée pour rester lisible ;
  // utilise logoUrlSombre (texte clair) si disponible.
  theme?: 'light' | 'glass';
  // Texte alternatif du logo — par défaut le nom ; '' quand le nom est déjà
  // affiché à côté (évite une double annonce aux lecteurs d'écran).
  alt?: string;
}) {
  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'xl' ? 'avatar-xl' : '';
  const className = ['avatar', sizeClass, theme === 'glass' ? 'avatar--glass' : ''].filter(Boolean).join(' ');
  const logo = theme === 'light' ? company.logoUrl : company.logoUrlSombre || company.logoUrl;

  if (logo) {
    return (
      <div className={className}>
        <img src={logo} alt={alt ?? company.nom} />
      </div>
    );
  }
  return (
    <div className={className} style={{ background: company.couleurMarque || '#a5a398' }}>
      {company.icone ? (
        <SocieteIcon icone={company.icone} className="avatar-fallback-icon" />
      ) : (
        company.nom.charAt(0).toUpperCase()
      )}
    </div>
  );
}
