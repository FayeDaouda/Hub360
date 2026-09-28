import type { ReactNode } from 'react';
import { ChartNoAxesColumn, FileText, Folder, SquareCheckBig, Users } from 'lucide-react';
import Link from 'next/link';
import { FondLiquide } from '@/components/fond-liquide';
import { HubLogo } from '@/components/hub-logo';
import { SelecteurTheme } from '@/components/selecteur-theme';

// Écrans d'accès (portail, connexion, mot de passe oublié, activation,
// réinitialisation) — maquette « liquid glass », sept. 2026. Deux niveaux :
//
// - CadreAcces : fond + sélecteur de thème, posé UNE fois par le layout du
//   groupe de routes app/(acces). Il reste monté d'un écran à l'autre : le
//   fond ne se recharge jamais, ses bulles glissent vers la composition du
//   nouvel écran (CSS :has() sur .auth-shell-contenu--duo / --centre).
// - ContenuAcces : la colonne de contenu d'un écran (logo ou présentation
//   hub360°, puis la carte / la grille de l'écran).

export function CadreAcces({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <FondLiquide />
      <div className="auth-shell-barre">
        <SelecteurTheme />
      </div>
      {children}
    </div>
  );
}

// Textes repris tels quels de la maquette validée (sept. 2026).
const ATOUTS = [
  { Icone: Folder, titre: 'Projets', texte: 'Organisez et suivez vos projets' },
  { Icone: SquareCheckBig, titre: 'Tâches', texte: 'Boostez votre productivité' },
  { Icone: FileText, titre: 'Documents', texte: 'Stockez et partagez facilement' },
  { Icone: Users, titre: 'Équipe', texte: 'Collaborez en toute simplicité' },
  { Icone: ChartNoAxesColumn, titre: 'Analyses', texte: 'Prenez des décisions éclairées' },
];

type Props = {
  children: ReactNode;
  /** Colonne de présentation hub360° à gauche de la carte (écran de connexion). */
  presentation?: boolean;
  /** Faux sur le portail lui-même (le logo y pointerait vers la page courante). */
  logoVersPortail?: boolean;
  /** Classe de mise en page propre à un écran (ex. « portail »). */
  className?: string;
};

// Grand écran : présentation à gauche, carte à droite (--duo) ou colonne
// centrée (--centre). Sous 1024px : toujours une colonne, présentation
// réduite au logo + accroche.
export function ContenuAcces({
  children,
  presentation = false,
  logoVersPortail = true,
  className,
}: Props) {
  const logo = logoVersPortail ? (
    <Link href="/" className="auth-logo" aria-label="hub360° — retour au portail">
      <HubLogo />
    </Link>
  ) : (
    <div className="auth-logo">
      <HubLogo />
    </div>
  );

  return (
    <main
      className={[
        'auth-shell-contenu',
        presentation ? 'auth-shell-contenu--duo' : 'auth-shell-contenu--centre',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {presentation ? (
        <section className="auth-presentation" aria-label="hub360°">
          {logo}
          <p className="auth-accroche">
            Tout votre univers,
            <br />
            au même endroit.
          </p>
          <p className="auth-intro">
            Gérez vos projets, vos tâches, vos documents, votre équipe et bien plus encore.
            Une seule plateforme, une infinité de possibilités.
          </p>
          <ul className="auth-atouts">
            {ATOUTS.map(({ Icone, titre, texte }) => (
              <li key={titre} className="auth-atout">
                <span className="auth-atout-icone">
                  <Icone size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="auth-atout-texte">
                  <strong>{titre}</strong>
                  <span>{texte}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="auth-signature">Plus qu’un outil, un écosystème.</p>
        </section>
      ) : (
        <div className="auth-logo--seul">{logo}</div>
      )}
      {children}
    </main>
  );
}
