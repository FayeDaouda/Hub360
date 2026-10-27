import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';

// Changement d'état animé (View Transitions) : une tâche déposée glisse vers
// sa nouvelle place (« En validation », colonne de droite) au lieu de sauter.
export function animate(update: () => void) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

// Nom de transition d'une tâche (unique : une tâche n'est rendue qu'une fois).
export const transitionStyle = (id: string) => ({ viewTransitionName: `mt-${id}` }) as CSSProperties;
