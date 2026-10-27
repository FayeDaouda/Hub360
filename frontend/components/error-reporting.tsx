'use client';

import { useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { urlApi } from '@/lib/client-api';

// Au plus cinq erreurs par page chargée, sans doublon.
const MAX_PER_PAGE = 5;
// Bruit connu des navigateurs, sans rapport avec le code du HUB.
const IGNORED = [/^ResizeObserver loop/, /^Script error\.?$/];

// Erreurs du navigateur (exceptions, promesses rejetées sans traitement)
// remontées au suivi des erreurs de l'API (backend/src/monitoring), pour un
// utilisateur connecté seulement. Rien n'est affiché. Appel direct, pas
// apiAuth : un signalement ne doit jamais déconnecter ni rediriger.
export function ErrorReporting() {
  useEffect(() => {
    const seen = new Set<string>();
    const report = (message: string, stack?: string) => {
      const session = getSession();
      if (!session || !message || seen.size >= MAX_PER_PAGE || seen.has(message)) return;
      if (IGNORED.some((motif) => motif.test(message))) return;
      seen.add(message);
      void fetch(urlApi('/erreurs-client'), {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          message: message.slice(0, 500),
          stack: stack?.slice(0, 4000),
          page: window.location.pathname.slice(0, 300),
        }),
      }).catch(() => undefined);
    };
    const onError = (e: ErrorEvent) =>
      report(e.message || String(e.error), e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) =>
      report(
        e.reason instanceof Error ? e.reason.message : String(e.reason),
        e.reason instanceof Error ? e.reason.stack : undefined,
      );
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
