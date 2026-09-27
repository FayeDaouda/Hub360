'use client';

// Préférence clair/sombre — refonte dark/light, sept. 2026 (décision boss,
// validée sur maquette). Choisie et mémorisée par la personne (localStorage,
// par appareil, même motif que notification-sound.ts) — jamais déduite de
// prefers-color-scheme : l'app a UN mode par défaut assumé (sombre), pas une
// simple copie de la préférence OS.
export type Theme = 'dark' | 'light';

const CLE_THEME = 'hub_theme';
const THEME_PAR_DEFAUT: Theme = 'dark';

export function themePrefere(): Theme {
  try {
    const v = localStorage.getItem(CLE_THEME);
    return v === 'light' || v === 'dark' ? v : THEME_PAR_DEFAUT;
  } catch {
    return THEME_PAR_DEFAUT;
  }
}

export function definirThemePrefere(theme: Theme): void {
  try {
    localStorage.setItem(CLE_THEME, theme);
  } catch {
    /* navigation privée / storage bloqué — le choix reste sans effet persistant */
  }
  appliquerTheme(theme);
}

export function appliquerTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

// Script inline exécuté avant l'hydratation React (cf. app/layout.tsx) — pose
// l'attribut sur <html> dès le premier paint pour éviter un flash clair→sombre
// à chaque chargement. Chaîne littérale (pas d'import) : injectée telle
// quelle dans un <script> côté serveur.
export const SCRIPT_THEME_INITIAL = `(function(){try{var t=localStorage.getItem('${CLE_THEME}');document.documentElement.dataset.theme=(t==='light'?'light':'dark');}catch(e){document.documentElement.dataset.theme='dark';}})();`;
