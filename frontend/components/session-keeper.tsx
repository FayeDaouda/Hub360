'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { datesJeton, getSession, remplacerSession, retourConnexion } from '@/lib/auth';
import { prolongerSession } from '@/lib/profil';
import type { Session } from '@/lib/types';

// Durée des sessions côté navigateur (décision du 28/10/2026, lot B ; règles
// et durées : backend/src/auth/session.ts) :
// - l'activité de la personne (clavier, souris, toucher) fait prolonger la
//   session, à sa première activité sur la page puis au plus toutes les
//   5 minutes ; les appels automatiques (notifications, chat) ne comptent pas ;
// - à l'échéance du jeton, retour à l'écran de connexion : l'écran ne reste
//   pas affiché sur un poste laissé sans surveillance.
// L'échéance se compte entre deux lectures de l'horloge du poste : réception
// du jeton (recuLe), puis maintenant, sur la durée donnée par le serveur
// (exp − iat). Une horloge décalée ne déconnecte donc pas en avance.
const PROLONGATION_MS = 5 * 60_000;
const NOUVEL_ESSAI_MS = 60_000;
const VERIFICATION_MS = 30_000;
const ACTIVITE = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
// Espaces connectés. Ailleurs (portail, connexion, liens publics de devis et
// de contrat), rien n'est prolongé ni fermé.
const ESPACE_CONNECTE = /^\/(admin|espace)\/|^\/groupe(\/|$)/;

export function SessionKeeper() {
  const connecte = ESPACE_CONNECTE.test(usePathname() ?? '');

  useEffect(() => {
    if (!connecte) return;
    // Session enregistrée avant le lot B (sans recuLe) : comptée depuis sa
    // première lecture dans cet onglet.
    let jetonLu = '';
    let luLe = 0;
    let prochaineProlongation = 0;
    let enCours = false;

    const verifier = () => {
      const session = getSession();
      if (!session) return;
      if (session.access_token !== jetonLu) {
        jetonLu = session.access_token;
        luLe = Date.now();
      }
      const dates = datesJeton(session.access_token);
      if (dates && Date.now() >= (session.recuLe ?? luLe) + (dates.exp - dates.iat) * 1000) {
        retourConnexion(session.societe.slug);
      }
    };

    const surActivite = () => {
      if (enCours || Date.now() < prochaineProlongation || !getSession()) return;
      enCours = true;
      prolongerSession()
        // Droits relus avec le jeton : un module coupé ou rendu par
        // l'Administrateur HUB apparaît ou disparaît sans reconnexion.
        .then(({ access_token, permissions }) => {
          const session = getSession();
          if (session)
            remplacerSession({ ...session, access_token, permissions: permissions as Session['permissions'] });
          prochaineProlongation = Date.now() + PROLONGATION_MS;
        })
        // Session refusée : apiAuth ramène déjà à la connexion. Réseau coupé :
        // nouvel essai à la prochaine activité, une minute plus tard.
        .catch(() => {
          prochaineProlongation = Date.now() + NOUVEL_ESSAI_MS;
        })
        .finally(() => {
          enCours = false;
        });
    };

    const auRetour = () => {
      if (document.visibilityState === 'visible') verifier();
    };

    verifier();
    const minuterie = window.setInterval(verifier, VERIFICATION_MS);
    document.addEventListener('visibilitychange', auRetour);
    // Écoute en phase de capture : un écran qui arrête la propagation d'un
    // événement compte quand même comme activité.
    for (const evenement of ACTIVITE) {
      window.addEventListener(evenement, surActivite, { capture: true, passive: true });
    }
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', auRetour);
      for (const evenement of ACTIVITE) window.removeEventListener(evenement, surActivite, { capture: true });
    };
  }, [connecte]);

  return null;
}
