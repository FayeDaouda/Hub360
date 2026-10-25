// Sortie « standalone » : l'image Docker de production n'embarque que le
// serveur Next et ses dépendances réelles (cf. deploy/frontend.Dockerfile).
// Sans effet en développement (next dev).

const developpement = process.env.NODE_ENV === 'development';

// Même valeur par défaut que lib/client-api.ts. En production, « /api »
// (relatif, derrière Caddy) est couvert par 'self'.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const ORIGINE_API = API_URL.startsWith('/') ? null : new URL(API_URL).origin;

// Politique de contenu : tout vient du HUB lui-même. 'unsafe-inline' reste
// nécessaire pour les scripts d'amorçage de Next et le script de thème
// (app/layout.tsx), et pour les attributs style de React ; connect-src et
// img-src empêchent tout de même d'envoyer des données vers un autre site.
// En développement, Next a besoin d'eval et du websocket de rechargement.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${developpement ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  ['connect-src', "'self'", ORIGINE_API, developpement && 'ws:'].filter(Boolean).join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// helmet ne couvre que l'API : ces en-têtes protègent les pages elles-mêmes
// (audit du 24/10/2026, E2).
const ENTETES_SECURITE = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Les liens publics (devis, contrat) portent leur jeton dans l'adresse : seul
  // le domaine est transmis à un autre site.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(developpement ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

module.exports = {
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: ENTETES_SECURITE }];
  },
};
