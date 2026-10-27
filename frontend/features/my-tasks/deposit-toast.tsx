'use client';

import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import { UNDO_DELAY_MS } from './use-my-tasks';

// « Tâche déposée · Annuler » : barre qui se vide pendant le délai
// d'annulation (au-dessus de la navigation du bas sur téléphone).
export function DepositToast({ libelle, onCancel }: { libelle: string; onCancel: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="mt-toast" role="status" style={{ '--mt-toast-duree': `${UNDO_DELAY_MS}ms` } as CSSProperties}>
      <CheckCircle2 size={17} aria-hidden />
      <span className="mt-toast-texte">« {libelle} » déposée</span>
      <button type="button" className="mt-toast-annuler" onClick={onCancel}>
        Annuler
      </button>
      <span className="mt-toast-barre" aria-hidden />
    </div>,
    document.body,
  );
}
