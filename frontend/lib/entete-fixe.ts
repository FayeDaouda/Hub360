import { useLayoutEffect } from 'react';

// En-tête fixe d'une page (CSS .page-entete-fixe / .entete-fixe) : il colle
// sous la barre du haut (hauteur --ef-topbar-h, mesurée par la coque :
// lib/defilement.ts). Sa propre hauteur (--ef-entete-h) sert aux titres de
// section qui collent à leur tour sous lui (Mes tâches) et au scroll-padding
// des ancres. `pret` : à passer quand l'en-tête n'apparaît qu'après un
// chargement (squelette d'abord) — la mesure est relancée quand il existe.
export function useEnteteFixe(pret = true) {
  useLayoutEffect(() => {
    const entete = document.querySelector<HTMLElement>('.entete-fixe');
    if (!entete) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty('--ef-entete-h', `${entete.offsetHeight}px`);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(entete);
    return () => {
      obs.disconnect();
      racine.style.removeProperty('--ef-entete-h');
    };
  }, [pret]);
}
