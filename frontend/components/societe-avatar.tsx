import { Societe } from '@/lib/types';
import { SocieteIcon } from './societe-icon';

type Props = {
  societe: Pick<Societe, 'nom' | 'logoUrl' | 'logoUrlSombre' | 'couleurMarque' | 'icone'>;
  size?: 'md' | 'lg' | 'xl';
  // 'glass' : posé sur la carte vitrée de l'écran de login (au-dessus d'une
  // photo) — pas de tuile, juste une ombre portée pour rester lisible ;
  // utilise logoUrlSombre (texte clair) si disponible.
  theme?: 'light' | 'glass';
  // Texte alternatif du logo — par défaut le nom ; '' quand le nom est déjà
  // affiché à côté (évite une double annonce aux lecteurs d'écran).
  alt?: string;
};

export function SocieteAvatar({ societe, size = 'md', theme = 'light', alt }: Props) {
  const sizeClass = size === 'lg' ? 'avatar-lg' : size === 'xl' ? 'avatar-xl' : '';
  const className = ['avatar', sizeClass, theme === 'glass' ? 'avatar--glass' : ''].filter(Boolean).join(' ');

  const logo = theme === 'light' ? societe.logoUrl : societe.logoUrlSombre || societe.logoUrl;

  if (logo) {
    return (
      <div className={className}>
        <img src={logo} alt={alt ?? societe.nom} />
      </div>
    );
  }

  // Pas de logo pour cette société : icône représentative si définie, sinon
  // simple initiale — jamais une tuile vide.
  return (
    <div className={className} style={{ background: societe.couleurMarque || '#a5a398' }}>
      {societe.icone ? (
        <SocieteIcon icone={societe.icone} className="avatar-fallback-icon" />
      ) : (
        societe.nom.charAt(0).toUpperCase()
      )}
    </div>
  );
}
