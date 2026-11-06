'use client';

import { useEffect, useState } from 'react';
import {
  type CategorieNotification,
  enHeuresCalmes,
  normaliserPreferences,
  type PreferencesNotifications,
  PREFERENCES_PAR_DEFAUT,
} from '@hub/domain';
import { apiSociete } from './client-api';
import { sonActive } from './notification-sound';

// Préférences de notification de la personne (02/11/2026) : une copie en
// mémoire partagée par la cloche, les pop-ups et la messagerie, relue au
// chargement et après chaque enregistrement (Mes réglages).
let courantes: PreferencesNotifications = PREFERENCES_PAR_DEFAUT;
const abonnes = new Set<(p: PreferencesNotifications) => void>();
const publier = (p: PreferencesNotifications) => {
  courantes = p;
  abonnes.forEach((f) => f(p));
};

export const getPreferencesNotifications = (slug: string) =>
  apiSociete<PreferencesNotifications>(slug, '/notifications/preferences').then((p) => {
    const n = normaliserPreferences(p);
    publier(n);
    return n;
  });
export const enregistrerPreferencesNotifications = (slug: string, p: PreferencesNotifications) =>
  apiSociete<PreferencesNotifications>(slug, '/notifications/preferences', { method: 'PUT', body: p }).then((r) => {
    const n = normaliserPreferences(r);
    publier(n);
    return n;
  });

export function usePreferencesNotifications(slug: string): PreferencesNotifications {
  const [p, setP] = useState(courantes);
  useEffect(() => {
    abonnes.add(setP);
    getPreferencesNotifications(slug).catch(() => {});
    return () => {
      abonnes.delete(setP);
    };
  }, [slug]);
  return p;
}

// Pop-up voulu pour cette catégorie.
export const popupPermis = (c: CategorieNotification) => courantes.categories[c].popup;
// Son voulu : sur cet appareil, pour cette catégorie, hors heures calmes.
export const sonPermis = (c: CategorieNotification) =>
  sonActive() && courantes.categories[c].son && !enHeuresCalmes(courantes);
