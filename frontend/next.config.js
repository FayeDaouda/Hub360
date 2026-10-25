// Sortie « standalone » : l'image Docker de production n'embarque que le
// serveur Next et ses dépendances réelles (cf. deploy/frontend.Dockerfile).
// Sans effet en développement (next dev).

const developpement = process.env.NODE_ENV === 'development';

// La politique de contenu (CSP), qui change à chaque requête (nonce), est posée
// par proxy.ts.
// helmet ne couvre que l'API : ces en-têtes protègent les pages elles-mêmes
// (audit du 24/10/2026, E2).
const ENTETES_SECURITE = [
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
