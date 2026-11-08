import type { Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { LucideProvider } from 'lucide-react';
import './globals.css';
import { SCRIPT_THEME_INITIAL } from '@/lib/theme';
import { SynchroTheme } from '@/components/synchro-theme';
import { ConfirmationProvider } from '@/components/confirmation';
import { ErrorReporting } from '@/components/error-reporting';
import { SessionKeeper } from '@/components/session-keeper';

// Geist et Geist Mono (paquet `geist`, auto-hébergées par next/font/local) :
// une seule famille pour les titres, le texte, les montants et les codes —
// identique sur Mac, Windows et Linux. Les jetons --font-sans / --font-titre
// / --font-mono (app/styles/00-jetons.css) lisent ces variables.

// viewport-fit=cover : sans lui, env(safe-area-inset-*) vaut 0 sur iPhone —
// en app installée (manifest « standalone »), la barre d'accueil recouvrait
// les libellés de la navigation du bas (qui réserve déjà cette marge).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata = {
  title: 'hub360°',
  description: 'Portail de gestion de la holding',
  manifest: '/manifest.json', // pour la PWA
  icons: {
    // Onglet : le H seul, sans fond. Le SVG adapte sa barre centrale au thème
    // du navigateur ; le .ico (16/32/48 px) sert aux navigateurs sans favicon
    // SVG. Ne pas mettre sizes: 'any' sur le .ico : Chrome le préférerait
    // alors au SVG (Firefox, lui, prend la dernière icône déclarée).
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/logos/hub-favicon.svg', type: 'image/svg+xml' },
    ],
    // Écran d'accueil iOS : carré 180 px à fond plein (iOS noircit la
    // transparence et arrondit lui-même les coins).
    apple: '/icons/apple-touch-icon.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce de la politique de contenu, posé par proxy.ts pour cette requête.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // suppressHydrationWarning : data-theme(-pref) est posé par le script ci-dessous
    // avant l'hydratation, donc absent du HTML serveur — écart voulu (un seul
    // niveau : n'étouffe rien chez les enfants).
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Pose data-theme avant l'hydratation — évite un flash clair→sombre
            au chargement (cf. lib/theme.ts). */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_THEME_INITIAL }} />
      </head>
      <body>
        <SynchroTheme />
        {/* Erreurs du navigateur remontées au suivi (rien d'affiché). */}
        <ErrorReporting />
        {/* Durée des sessions : prolongée par l'activité, fermée à
            l'échéance (rien d'affiché). */}
        <SessionKeeper />
        {/* Trait des icônes Lucide affiné (2 → 1,5) partout ; une icône qui
            passe son propre strokeWidth le garde. */}
        <LucideProvider strokeWidth={1.5}>
          {/* Confirmations dans la modale de l'app (useConfirmer). */}
          <ConfirmationProvider>{children}</ConfirmationProvider>
        </LucideProvider>
      </body>
    </html>
  );
}
