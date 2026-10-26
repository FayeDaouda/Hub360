import type { ReactNode } from 'react';

// États d'attente et d'absence de données, communs à tous les écrans.

/** Bloc de chargement (squelette), décoratif : masqué aux lecteurs d'écran. */
export function Skeleton({ size, className }: { size?: 'sm'; className?: string }) {
  const classes = ['skeleton', className ?? 'admin-skeleton-panel', size === 'sm' && 'admin-skeleton-panel--sm'];
  return <div className={classes.filter(Boolean).join(' ')} aria-hidden />;
}

/** Message « rien à afficher » d'une liste ou d'un tableau. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
