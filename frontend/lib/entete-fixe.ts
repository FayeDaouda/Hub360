import { useLayoutEffect } from 'react';

// En-tête fixe d'une page (CSS .page-entete-fixe / .entete-fixe) : la barre
// du haut colle en haut de l'écran ; sa hauteur réelle (deux lignes sur
// mobile) est mesurée pour coller l'en-tête de la page juste en dessous.
export function useEnteteFixe() {
  useLayoutEffect(() => {
    const barre = document.querySelector<HTMLElement>('.admin-topbar');
    if (!barre) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty('--ef-topbar-h', `${barre.offsetHeight}px`);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(barre);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--ef-topbar-h');
    };
  }, []);
}
