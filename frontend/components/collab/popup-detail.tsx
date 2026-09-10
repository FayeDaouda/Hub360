'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

// Popup de détail d'une tuile KPI : révèle le calcul projet par projet qu'on ne
// voit nulle part ailleurs (avancement checklists, délais avant-projet). Pour
// une tuile qui ne fait que pointer vers un sous-ensemble navigable
// (« Projets en cours », « Livrés »), on utilise un lien, pas ce composant.
// Même ossature que assigner-projet-modal : Échap + clic hors cadre.

export type LigneDetail = {
  id: string;
  code: string;
  programme: string;
  href: string;
  valeur: string;
  // ok (Sauge) · alerte (Ocre, échéance proche) · retard (rouge, dépassé) · neutre
  ton?: 'ok' | 'alerte' | 'retard' | 'neutre';
  sous?: string;
};

type Props = {
  titre: string;
  intro?: string;
  lignes: LigneDetail[];
  vide: string;
  onClose: () => void;
};

export function PopupDetail({ titre, intro, lignes, vide, onClose }: Props) {
  const fermeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fermeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-detail-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="popup-detail-titre">{titre}</h2>
          <button
            ref={fermeRef}
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          {intro && <p className="popup-detail-intro">{intro}</p>}
          {lignes.length === 0 ? (
            <p className="empty-state">{vide}</p>
          ) : (
            <ul className="popup-detail-liste">
              {lignes.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} className="popup-detail-row" onClick={onClose}>
                    <span className="popup-detail-nom">
                      <span className="collab-worklist-code">{l.code}</span>
                      {l.programme}
                    </span>
                    <span className="popup-detail-droite">
                      <span
                        className={`popup-detail-val popup-detail-val--${l.ton ?? 'neutre'}`}
                      >
                        {l.valeur}
                      </span>
                      {l.sous && <span className="popup-detail-sous">{l.sous}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
