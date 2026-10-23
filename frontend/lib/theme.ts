'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Préférence clair/sombre — refonte dark/light, sept. 2026 (décision boss,
// validée sur maquette). Choisie et mémorisée par la personne (localStorage,
// par appareil, même motif que notification-sound.ts). Le défaut reste
// 'dark' : l'app a UN mode assumé, pas une simple copie de la préférence OS.
// Deux choix seulement : l'option « Système » (suivre l'appareil) a été
// retirée le 23/10/2026 (revue du portail) — une ancienne valeur « system »
// encore stockée retombe sur le défaut.
export type Theme = 'dark' | 'light';
export type PreferenceTheme = Theme;

const CLE_THEME = 'hub_theme';
const PREFERENCE_PAR_DEFAUT: PreferenceTheme = 'dark';

function estPreference(valeur: unknown): valeur is PreferenceTheme {
  return valeur === 'dark' || valeur === 'light';
}

export function lirePreferenceTheme(): PreferenceTheme {
  try {
    const valeur = localStorage.getItem(CLE_THEME);
    return estPreference(valeur) ? valeur : PREFERENCE_PAR_DEFAUT;
  } catch {
    return PREFERENCE_PAR_DEFAUT;
  }
}

// Pose le thème sur <html> : data-theme pilote tous les jetons CSS,
// data-theme-pref (même valeur depuis le retrait de « Système ») permet aux sélecteurs (ex. le curseur
// de SelecteurTheme) d'afficher le bon état dès le premier paint, avant
// l'hydratation React. Transition en fondu (View Transitions) quand la
// bascule vient d'un geste de la personne, instantanée sinon.
function appliquer(preference: PreferenceTheme, anime: boolean): void {
  if (typeof document === 'undefined') return;
  const racine = document.documentElement;
  racine.dataset.themePref = preference;
  if (racine.dataset.theme === preference) return;

  // startViewTransition exécute ce rappel de façon asynchrone (après la
  // capture de l'ancien état) : on notifie ici, pas seulement à l'appelant,
  // sinon les abonnés reliraient l'ancien data-theme.
  const basculer = () => {
    racine.dataset.theme = preference;
    notifier();
  };
  const mouvementReduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (anime && !mouvementReduit && typeof document.startViewTransition === 'function') {
    document.startViewTransition(basculer);
  } else {
    basculer();
  }
}

// --- Magasin minimal pour useSyncExternalStore -----------------------------
// Un seul point de vérité (localStorage + attributs de <html>) ; les
// composants s'abonnent au lieu de dupliquer l'état dans leur useState.
const abonnes = new Set<() => void>();

function notifier(): void {
  abonnes.forEach((rappel) => rappel());
}

function sAbonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

function lireThemeAffiche(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function definirPreferenceTheme(preference: PreferenceTheme): void {
  try {
    localStorage.setItem(CLE_THEME, preference);
  } catch {
    /* navigation privée / storage bloqué — le choix reste sans effet persistant */
  }
  appliquer(preference, true);
  notifier();
}

// Synchronisation globale, démarrée une fois (composant SynchroTheme dans le
// layout racine) : répercute un changement fait dans un autre onglet.
export function demarrerSynchroTheme(): () => void {
  const surStockage = (evenement: StorageEvent) => {
    if (evenement.key !== CLE_THEME) return;
    appliquer(lirePreferenceTheme(), false);
    notifier();
  };
  window.addEventListener('storage', surStockage);
  return () => {
    window.removeEventListener('storage', surStockage);
  };
}

// Côté serveur (et pendant l'hydratation) : la préférence par défaut —
// React bascule ensuite sur la vraie valeur sans erreur d'hydratation.
export function usePreferenceTheme() {
  const preference = useSyncExternalStore(
    sAbonner,
    lirePreferenceTheme,
    () => PREFERENCE_PAR_DEFAUT,
  );
  const theme = useSyncExternalStore(sAbonner, lireThemeAffiche, () => 'dark' as const);
  const choisir = useCallback((suivante: PreferenceTheme) => definirPreferenceTheme(suivante), []);
  return { preference, theme, choisir };
}

// Script inline exécuté avant l'hydratation React (cf. app/layout.tsx) — pose
// les attributs sur <html> dès le premier paint pour éviter un flash
// clair→sombre à chaque chargement. Chaîne littérale (pas d'import) : injectée
// telle quelle dans un <script> côté serveur.
export const SCRIPT_THEME_INITIAL = `(function(){var d=document.documentElement,p='${PREFERENCE_PAR_DEFAUT}';try{var v=localStorage.getItem('${CLE_THEME}');if(v==='light'||v==='dark')p=v;}catch(e){}d.dataset.themePref=p;d.dataset.theme=p;})();`;
