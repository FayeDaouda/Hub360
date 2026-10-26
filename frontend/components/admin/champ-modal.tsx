'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

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
    <Modal onClose={onClose} busy={enCours} className="modal--sm" labelledBy="champ-titre">
      <ModalHeader title={titre} titleId="champ-titre" onClose={onClose} closeDisabled={enCours} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          lancer();
        }}
      >
        <Field label={label}>
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
        </Field>
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={enCours || valeur.trim() === ''}>
            {enCours ? '…' : confirmer}
          </button>
        </div>
      </form>
    </Modal>
  );
}
