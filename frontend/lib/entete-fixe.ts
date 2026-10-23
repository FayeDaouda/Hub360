import { useLayoutEffect } from 'react';

// En-tête fixe d'une page (CSS .page-entete-fixe / .entete-fixe) : la barre
// du haut colle en haut de l'écran ; sa hauteur réelle (deux lignes sur
// mobile) est mesurée pour coller l'en-tête de la page juste en dessous. La
// hauteur de cet en-tête (--ef-entete-h) sert aux titres de section qui
// collent à leur tour sous lui (Mes tâches). `pret` : à passer quand l'en-tête
// n'apparaît qu'après un chargement (squelette d'abord) — la mesure est
// relancée quand il existe.
export function useEnteteFixe(pret = true) {
  useLayoutEffect(() => {
    const barre = document.querySelector<HTMLElement>('.admin-topbar');
    if (!barre) return;
    const entete = document.querySelector<HTMLElement>('.entete-fixe');
    const racine = document.documentElement;
    const mesurer = () => {
      racine.style.setProperty('--ef-topbar-h', `${barre.offsetHeight}px`);
      if (entete) racine.style.setProperty('--ef-entete-h', `${entete.offsetHeight}px`);
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(barre);
    if (entete) obs.observe(entete);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--ef-topbar-h');
      racine.style.removeProperty('--ef-entete-h');
    };
  }, [pret]);
}
