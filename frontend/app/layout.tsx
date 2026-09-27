import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SCRIPT_THEME_INITIAL } from '@/lib/theme';
import { SynchroTheme } from '@/components/synchro-theme';

// Auto-hébergées par next/font — identiques sur toutes les machines (Mac,
// Windows, Linux), pas besoin qu'elles soient installées localement.
// Inter = corps de texte / données. Space Grotesk = titres et gros chiffres
// (police de travail validée en attendant « A-Space Demo » du site vitrine —
// cf. Direction visuelle §2 / §7).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'hub360°',
  description: 'Portail de gestion de la holding',
  manifest: '/manifest.json', // pour la PWA
  icons: {
    // Nouveau logo hub360° (refonte dark/light, sept. 2026) — icône seule,
    // fond sombre inclus dans le fichier (lisible sur n'importe quel chrome
    // de navigateur, pas besoin de variante par prefers-color-scheme).
    icon: [{ url: '/logos/hub-icon-dark.png', type: 'image/png' }],
    apple: '/logos/hub-icon-dark.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning : data-theme(-pref) est posé par le script ci-dessous
    // avant l'hydratation, donc absent du HTML serveur — écart voulu (un seul
    // niveau : n'étouffe rien chez les enfants).
    <html lang="fr" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* Pose data-theme avant l'hydratation — évite un flash clair→sombre
            au chargement (cf. lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME_INITIAL }} />
      </head>
      <body>
        <SynchroTheme />
        {children}
      </body>
    </html>
  );
}
