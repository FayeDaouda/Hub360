import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

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
    icon: [
      { url: '/logos/hub-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
