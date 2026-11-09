'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connecterFluxNotifications,
  getNotifications,
  marquerLuesParId,
  marquerNotificationsLues,
} from './notifications';
import { categorieNotification } from '@hub/domain';
import { jouerSonNotification } from './notification-sound';
import { popupPermis, sonPermis } from './preferences-notifications';
import type { FluxNotifications, NotificationItem } from './types';

// Temps réel (09/11/2026) : un flux SSE signale chaque notification, la
// cloche se relit aussitôt. Le sondage reste le filet : lent quand le flux
// est ouvert, rapide sinon (connexion en cours ou coupée).
const INTERVALLE_FLUX_OUVERT_MS = 60_000;
const INTERVALLE_SANS_FLUX_MS = 15_000;
// Signaux rapprochés (plusieurs notifications d'un coup) : une seule lecture.
const REGROUPEMENT_MS = 250;
// Devant le HUB : onglet visible, fenêtre active, et un geste (souris,
// clavier, toucher, défilement) depuis moins de 3 minutes.
const INACTIF_APRES_MS = 3 * 60_000;
// Pop-ups visibles en même temps ; au-delà, au retour d'une absence, un résumé.
const POPUPS_MAX = 3;

export type ResumeAbsence = { total: number; elements: NotificationItem[] };

// Présence de l'utilisateur devant le HUB (01/11/2026).
function usePresence(): boolean {
  const [present, setPresent] = useState(true);
  const derniereActivite = useRef(0);
  useEffect(() => {
    derniereActivite.current = Date.now();
    const evaluer = () =>
      setPresent(
        document.visibilityState === 'visible' &&
          document.hasFocus() &&
          Date.now() - derniereActivite.current < INACTIF_APRES_MS,
      );
    const activite = () => {
      derniereActivite.current = Date.now();
      evaluer();
    };
    const gestes = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    gestes.forEach((g) => window.addEventListener(g, activite, { passive: true }));
    window.addEventListener('focus', activite);
    window.addEventListener('blur', evaluer);
    document.addEventListener('visibilitychange', evaluer);
    const minuterie = setInterval(evaluer, 15_000);
    evaluer();
    return () => {
      gestes.forEach((g) => window.removeEventListener(g, activite));
      window.removeEventListener('focus', activite);
      window.removeEventListener('blur', evaluer);
      document.removeEventListener('visibilitychange', evaluer);
      clearInterval(minuterie);
    };
  }, []);
  return present;
}

// Partagé par la cloche : sonde le flux, garde la cloche à jour, et montre en
// pop-up les notifications STOCKÉES apparues depuis le montage — jamais les
// alertes d'échéance dérivées, recalculées à chaque appel. Devant le HUB, le
// pop-up arrive tout de suite ; absent, il attend son retour (au-delà de 3,
// un résumé). Le son accompagne l'apparition, pas l'arrivée.
export function useNotificationsPoll(slug: string) {
  const [flux, setFlux] = useState<FluxNotifications | null>(null);
  const [popups, setPopups] = useState<NotificationItem[]>([]);
  const [resume, setResume] = useState<ResumeAbsence | null>(null);
  const present = usePresence();

  const vus = useRef<Set<string> | null>(null);
  const enAttente = useRef<NotificationItem[]>([]);
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
  }, [present]);

  // Montre la file : pop-ups (3 au plus) ou, au retour d'une absence, un résumé.
  const montrer = useCallback((auRetour: boolean) => {
    // Préférences (02/11/2026) : pop-up et son selon la catégorie, son coupé
    // en heures calmes (le pop-up reste, silencieux).
    const file = enAttente.current.filter((n) => popupPermis(categorieNotification(n.type, n.derivee)));
    const sonnent = enAttente.current.some((n) => sonPermis(categorieNotification(n.type, n.derivee)));
    enAttente.current = [];
    if (sonnent) jouerSonNotification();
    if (!file.length) return;
    if (auRetour && file.length > POPUPS_MAX) {
      setResume({ total: file.length, elements: file.slice(-POPUPS_MAX).reverse() });
      return;
    }
    setPopups((l) => [...file.reverse(), ...l].slice(0, POPUPS_MAX));
  }, []);

  const traiterNouveaux = useCallback(
    (f: FluxNotifications) => {
      const stockees = f.elements.filter((e) => !e.derivee);
      if (vus.current === null) {
        // Premier chargement : mémorise l'existant sans le montrer.
        vus.current = new Set(stockees.map((e) => e.id));
        return;
      }
      for (const e of [...stockees].reverse()) {
        if (!vus.current.has(e.id)) {
          vus.current.add(e.id);
          if (!e.lu) enAttente.current.push(e);
        }
      }
      if (presentRef.current) montrer(false);
    },
    [montrer],
  );

  // Retour devant le HUB : ce qui est arrivé pendant l'absence.
  useEffect(() => {
    if (present) montrer(true);
  }, [present, montrer]);

  const charger = useCallback(() => {
    getNotifications(slug)
      .then((f) => {
        setFlux(f);
        traiterNouveaux(f);
      })
      .catch(() => {});
  }, [slug, traiterNouveaux]);

  // Flux temps réel : chaque signal relit la cloche (regroupé sur 250 ms).
  const [fluxOuvert, setFluxOuvert] = useState(false);
  useEffect(() => {
    let attente: ReturnType<typeof setTimeout> | null = null;
    const fermer = connecterFluxNotifications({
      slug,
      onSignal: () => {
        if (attente) return;
        attente = setTimeout(() => {
          attente = null;
          charger();
        }, REGROUPEMENT_MS);
      },
      // (Re)connecté : l'effet du sondage relit aussitôt la cloche (on
      // rattrape ce qui a pu arriver pendant la coupure).
      onEtat: (etat) => setFluxOuvert(etat === 'ouvert'),
    });
    return () => {
      fermer();
      if (attente) clearTimeout(attente);
    };
  }, [slug, charger]);

  useEffect(() => {
    charger();
    const id = setInterval(charger, fluxOuvert ? INTERVALLE_FLUX_OUVERT_MS : INTERVALLE_SANS_FLUX_MS);
    return () => clearInterval(id);
  }, [charger, fluxOuvert]);

  async function toutLire() {
    try {
      setFlux(await marquerNotificationsLues(slug));
    } catch {
      /* on garde l'état courant */
    }
  }

  // Ouverte = lue (01/11/2026) : au clic, dans la cloche comme dans un pop-up.
  const marquerLue = useCallback(
    (n: NotificationItem) => {
      setPopups((l) => l.filter((x) => x.id !== n.id));
      if (n.derivee || n.lu) return;
      setFlux((f) =>
        f
          ? {
              nonLues: Math.max(0, f.nonLues - 1),
              elements: f.elements.map((x) => (x.id === n.id ? { ...x, lu: true } : x)),
            }
          : f,
      );
      marquerLuesParId(slug, [n.id])
        .then(setFlux)
        .catch(() => {});
    },
    [slug],
  );

  return {
    flux,
    recharger: charger,
    toutLire,
    marquerLue,
    popups,
    fermerPopup: (id: string) => setPopups((l) => l.filter((x) => x.id !== id)),
    resume,
    fermerResume: () => setResume(null),
  };
}
