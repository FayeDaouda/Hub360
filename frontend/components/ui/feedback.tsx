import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

// États d'attente, d'erreur et d'absence de données, communs à tous les écrans.

/** Bloc de chargement (squelette), décoratif : masqué aux lecteurs d'écran. */
export function Skeleton({ size, className }: { size?: 'sm'; className?: string }) {
  const classes = ['skeleton', className ?? 'admin-skeleton-panel', size === 'sm' && 'admin-skeleton-panel--sm'];
  return <div className={classes.filter(Boolean).join(' ')} aria-hidden />;
}

/** Chargement en échec : le message, et « Réessayer » quand on peut relancer. */
export function ErrorState({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="dash-erreur" role="alert">
      <p>{children}</p>
      {onRetry && (
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden />
          <span>Réessayer</span>
        </button>
      )}
    </div>
  );
}

/** Message « rien à afficher » d'une liste ou d'un tableau. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
