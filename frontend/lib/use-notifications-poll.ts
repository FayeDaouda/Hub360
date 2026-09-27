'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getNotifications, marquerNotificationsLues } from './notifications';
import { jouerSonNotification } from './notification-sound';
import type { FluxNotifications, NotificationItem } from './types';

// Fréquence de sondage — pas de websocket dans cette appli, un intervalle
// suffit pour une équipe de 4 personnes (cf. mémoire hub360°).
const INTERVALLE_MS = 15_000;
const DUREE_TOAST_MS = 5_000;
const PAUSE_ENTRE_TOASTS_MS = 300;

// Partagé admin + collab : sonde le flux de notifications, garde la cloche à
// jour, et fait défiler en toast (5 s, une à la fois) les éléments STOCKÉS
// apparus depuis le montage — jamais les alertes d'échéance dérivées, dont la
// date est recalculée à chaque appel et paraîtrait donc toujours « neuve ».
export function useNotificationsPoll(slug: string) {
  const [flux, setFlux] = useState<FluxNotifications | null>(null);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  const vus = useRef<Set<string> | null>(null);
  const file = useRef<NotificationItem[]>([]);
  const toastEnCours = useRef(false);

  const defiler = useCallback(() => {
    if (toastEnCours.current) return;
    const prochain = file.current.shift();
    if (!prochain) return;
    toastEnCours.current = true;
    setToast(prochain);
    setTimeout(() => {
      setToast(null);
      toastEnCours.current = false;
      setTimeout(defiler, PAUSE_ENTRE_TOASTS_MS);
    }, DUREE_TOAST_MS);
  }, []);

  const traiterNouveaux = useCallback(
    (f: FluxNotifications) => {
      const stockees = f.elements.filter((e) => !e.derivee);
      if (vus.current === null) {
        // Premier chargement : mémorise l'existant sans le passer en toast.
        vus.current = new Set(stockees.map((e) => e.id));
        return;
      }
      let nouvelles = false;
      for (const e of stockees) {
        if (!vus.current.has(e.id)) {
          vus.current.add(e.id);
          file.current.push(e);
          nouvelles = true;
        }
      }
      // Un seul son pour tout le lot plutôt qu'un par notification — évite
      // une salve de carillons si plusieurs arrivent entre deux sondages.
      if (nouvelles) jouerSonNotification();
      defiler();
    },
    [defiler],
  );

  const charger = useCallback(() => {
    getNotifications(slug)
      .then((f) => {
        setFlux(f);
        traiterNouveaux(f);
      })
      .catch(() => {});
  }, [slug, traiterNouveaux]);

  useEffect(() => {
    charger();
    const id = setInterval(charger, INTERVALLE_MS);
    return () => clearInterval(id);
  }, [charger]);

  async function toutLire() {
    try {
      setFlux(await marquerNotificationsLues(slug));
    } catch {
      /* on garde l'état courant */
    }
  }

  return { flux, recharger: charger, toutLire, toast, fermerToast: () => setToast(null) };
}
