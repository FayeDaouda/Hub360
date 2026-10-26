'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, ModalHeader } from './dialog';

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Rejeter la promesse (ou throw) garde la modale ouverte et affiche le
  // message d'erreur en ligne — utile pour un 409 serveur.
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  // Au-dessus de tout (tiroirs, panneaux, autres modales) : confirmation
  // demandée depuis l'intérieur d'un panneau déjà ouvert.
  onTop?: boolean;
  // Action impossible tant que le formulaire du message est incomplet.
  confirmDisabled?: boolean;
};

const FOCUSABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onClose,
  onTop = false,
  confirmDisabled = false,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  const boutonAnnuler = useRef<HTMLButtonElement>(null);
  const boutonConfirmer = useRef<HTMLButtonElement>(null);

  // Focus à l'ouverture : sur « Annuler » pour une action destructrice (un
  // Entrée réflexe ne supprime rien), sinon sur l'action ; rendu à
  // l'élément d'origine à la fermeture.
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    (danger ? boutonAnnuler : boutonConfirmer).current?.focus();
    return () => origine?.focus?.();
  }, [danger]);

  // Échap à la capture, sans propagation : une confirmation ouverte depuis un
  // tiroir ne ferme pas le tiroir avec elle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) {
        e.stopPropagation();
        onClose();
        return;
      }
      // Tabulation piégée dans la boîte de dialogue.
      if (e.key === 'Tab' && boite.current) {
        const elements = [...boite.current.querySelectorAll<HTMLElement>(FOCUSABLES)];
        if (!elements.length) return;
        const premier = elements[0];
        const dernier = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    <Modal
      onClose={onClose}
      busy={enCours}
      closeOnEscape={false}
      backdropClassName={onTop ? 'modal-backdrop--premier-plan' : undefined}
      className="modal--sm"
      role="alertdialog"
      labelledBy="confirm-titre"
      describedBy="confirm-message"
      boxRef={boite}
    >
      <ModalHeader title={title} titleId="confirm-titre" onClose={onClose} closeDisabled={enCours} />
      <div className="modal-body">
        <p id="confirm-message" className="modal-message">
          {message}
        </p>
        {erreur && <p className="field-erreur">{erreur}</p>}
        <div className="modal-actions">
          <button ref={boutonAnnuler} type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
            {cancelLabel}
          </button>
          <button
            ref={boutonConfirmer}
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={lancer}
            disabled={enCours || confirmDisabled}
          >
            {enCours ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
