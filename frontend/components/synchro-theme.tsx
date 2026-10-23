'use client';

import { useEffect } from 'react';
import { demarrerSynchroTheme } from '@/lib/theme';

// Monté une seule fois dans le layout racine : garde le thème affiché aligné
// sur les autres onglets, sur toutes les pages — pas seulement celles qui ont
// un sélecteur.
export function SynchroTheme() {
  useEffect(() => demarrerSynchroTheme(), []);
  return null;
}
