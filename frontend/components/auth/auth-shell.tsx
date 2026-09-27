import type { ReactNode } from 'react';
import { ChartNoAxesColumn, FileText, Folder, SquareCheckBig, Users } from 'lucide-react';
import { FondLiquide } from '@/components/fond-liquide';
import { HubLogo } from '@/components/hub-logo';
import { SelecteurTheme } from '@/components/selecteur-theme';

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
};

// Cadre commun de tous les écrans d'authentification (connexion, mot de
// passe oublié, activation, réinitialisation) : fond liquid glass, sélecteur
// de thème, logo — les pages n'apportent que leur carte (.auth-carte).
// Grand écran : présentation à gauche, carte à droite. Sous 1024px : une
// colonne, présentation réduite au logo + accroche.
export function AuthShell({ children, presentation = false }: Props) {
  return (
    <div className="auth-shell">
      <FondLiquide composition={presentation ? 'duo' : 'centre'} />
      <div className="auth-shell-barre">
        <SelecteurTheme />
      </div>
      <main className={`auth-shell-contenu${presentation ? ' auth-shell-contenu--duo' : ''}`}>
        {presentation ? (
          <section className="auth-presentation" aria-label="hub360°">
            <a href="/" className="auth-logo" aria-label="hub360° — retour au portail">
              <HubLogo />
            </a>
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
          <a href="/" className="auth-logo auth-logo--seul" aria-label="hub360° — retour au portail">
            <HubLogo />
          </a>
        )}
        {children}
      </main>
    </div>
  );
}
