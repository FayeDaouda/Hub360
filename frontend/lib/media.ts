'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Vrai quand la media query correspond (ex. '(min-width: 1400px)'), suivi en
// direct. Côté serveur et pendant l'hydratation : faux — la mise en page
// « étroite » sert de base, la large s'ajoute après coup sans erreur.
export function useMediaQuery(requete: string): boolean {
  const sAbonner = useCallback(
    (rappel: () => void) => {
      // Sans matchMedia (environnement de test, très vieux navigateur) : faux.
      const mq = window.matchMedia?.(requete);
      mq?.addEventListener('change', rappel);
      return () => mq?.removeEventListener('change', rappel);
    },
    [requete],
  );
  return useSyncExternalStore(
    sAbonner,
    () => window.matchMedia?.(requete).matches ?? false,
    () => false,
  );
}
