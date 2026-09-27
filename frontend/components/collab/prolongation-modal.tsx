'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Props = {
  libelle: string;
  echeanceActuelle: string | null;
  onSubmit: (payload: { echeance: string; motif?: string }) => Promise<void>;
  onClose: () => void;
};

// Popup « Demander une prolongation » — nouvelle échéance + note optionnelle,
// ouverte depuis l'emplacement occupé par le champ note (cf. échange du 2026-09-17).
export function ProlongationModal({ libelle, echeanceActuelle, onSubmit, onClose }: Props) {
  const [echeance, setEcheance] = useState(echeanceActuelle ?? '');
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function lancer() {
    if (!echeance) {
      setErreur('Choisis une nouvelle échéance.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await onSubmit({ echeance, motif: motif.trim() || undefined });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi de la demande impossible.');
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prolongation-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="prolongation-titre">Demander une prolongation</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
            disabled={enCours}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            lancer();
          }}
        >
          <p className="lecture-para" style={{ marginTop: 0 }}>
            {libelle}
          </p>
          <label className="field">
            <span className="field-label">Nouvelle échéance</span>
            <input
              ref={ref}
              type="date"
              className="field-input"
              value={echeance}
              onChange={(e) => {
                setEcheance(e.target.value);
                setErreur(null);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Note (optionnel)</span>
            <input
              className="field-input"
              placeholder="motif de la demande…"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </label>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours || !echeance}>
              {enCours ? '…' : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
