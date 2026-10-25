'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Props = {
  titre: string;
  label: string;
  valeurInitiale?: string;
  placeholder?: string;
  confirmer?: string;
  // Rejeter la promesse garde la modale ouverte + affiche l'erreur en ligne.
  onSubmit: (valeur: string) => void | Promise<void>;
  onClose: () => void;
};

// Petite modale « un champ texte » — remplace window.prompt (créer / renommer).
export function ChampModal({
  titre,
  label,
  valeurInitiale = '',
  placeholder,
  confirmer = 'Enregistrer',
  onSubmit,
  onClose,
}: Props) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  async function lancer() {
    const v = valeur.trim();
    if (!v) {
      setErreur('Ce champ est requis.');
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await onSubmit(v);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="champ-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="champ-titre">{titre}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose} disabled={enCours}>
            <X size={18} />
          </button>
        </header>
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            lancer();
          }}
        >
          <label className="field">
            <span className="field-label">{label}</span>
            <input
              ref={ref}
              className="field-input"
              value={valeur}
              placeholder={placeholder}
              onChange={(e) => {
                setValeur(e.target.value);
                setErreur(null);
              }}
            />
          </label>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours || valeur.trim() === ''}>
              {enCours ? '…' : confirmer}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
