import { NextRequest, NextResponse } from 'next/server';

// Politique de contenu (CSP) avec un nonce par requête : seuls les scripts
// portant ce nonce s'exécutent (ceux de Next et le script de thème du layout),
// plus aucun script en ligne arbitraire (« unsafe-inline » retiré des scripts).
// Les styles gardent 'unsafe-inline' : les attributs style de React ne peuvent
// pas porter de nonce, et un nonce dans style-src le désactiverait. En
// développement, React a besoin d'eval et Next du websocket de rechargement.
// Les autres en-têtes de sécurité sont dans next.config.js.

const developpement = process.env.NODE_ENV === 'development';

// Même valeur par défaut que lib/client-api.ts. En production, « /api »
// (relatif, derrière Caddy) est couvert par 'self'.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const ORIGINE_API = API_URL.startsWith('/') ? null : new URL(API_URL).origin;

function politique(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developpement ? " 'unsafe-eval'" : ''}`,
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
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = politique(nonce);
  // Next lit le nonce dans l'en-tête CSP de la requête pour l'appliquer à ses
  // propres scripts ; x-nonce le transmet au layout (script de thème).
  const entetes = new Headers(request.headers);
  entetes.set('x-nonce', nonce);
  entetes.set('Content-Security-Policy', csp);
  const reponse = NextResponse.next({ request: { headers: entetes } });
  reponse.headers.set('Content-Security-Policy', csp);
  return reponse;
}

export const config = {
  matcher: [
    // Pages seulement : ni fichiers statiques, ni préchargements de next/link.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|logos/|icons/|manifest.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
