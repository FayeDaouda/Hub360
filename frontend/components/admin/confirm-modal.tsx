'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = {
  titre: string;
  message: ReactNode;
  confirmer?: string;
  annuler?: string;
  danger?: boolean;
  // Rejeter la promesse (ou throw) garde la modale ouverte et affiche le
  // message d'erreur en ligne — utile pour un 409 serveur.
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmModal({
  titre,
  message,
  confirmer = 'Confirmer',
  annuler = 'Annuler',
  danger = false,
  onConfirm,
  onClose,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function lancer() {
    setEnCours(true);
    setErreur(null);
    try {
      await onConfirm();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible');
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="confirm-titre">{titre}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
            disabled={enCours}
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              {annuler}
            </button>
            <button
              type="button"
              className={danger ? 'btn-danger' : 'btn-primary'}
              onClick={lancer}
              disabled={enCours}
            >
              {enCours ? '…' : confirmer}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
