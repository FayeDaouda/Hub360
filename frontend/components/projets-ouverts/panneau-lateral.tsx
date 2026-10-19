'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Panneau latéral (tâche, fil d'une carte) : même tiroir que la fiche CRM —
// la liste reste en place derrière ; Échap ou un clic à côté referme.
export function PanneauLateral({ titre, entete, onClose, children }: { titre: string; entete?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <div className="fiche-crm panneau-lateral" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="fiche-crm-entete">
          <div>{entete}</div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
