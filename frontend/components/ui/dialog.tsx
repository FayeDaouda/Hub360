'use client';

import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Fenêtres de dialogue : un seul comportement pour toutes (fond cliquable,
// Échap, envoi en cours, portail). Le contenu reste libre. Les classes CSS
// sont celles d'avant la structuration : le rendu ne change pas.

type DialogProps = {
  onClose: () => void;
  // Envoi en cours : ni le fond ni Échap ne ferment la fenêtre.
  busy?: boolean;
  // Quelques fenêtres ne se fermaient pas à Échap ; l'harmonisation est à
  // décider (changement de comportement), d'ici là elles le disent ici.
  closeOnEscape?: boolean;
  // Rendu dans document.body : ouverte depuis un panneau en verre
  // (backdrop-filter), la fenêtre « fixed » serait sinon enfermée et rognée.
  portal?: boolean;
  backdropClassName: string;
  className: string;
  as?: 'div' | 'aside';
  role?: 'dialog' | 'alertdialog';
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  // Clavier propre à la fenêtre (navigation dans une liste, Échap local).
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  // Accès à la boîte (piège de tabulation de la confirmation).
  boxRef?: Ref<HTMLDivElement>;
  children: ReactNode;
};

export function Dialog({
  onClose,
  busy = false,
  closeOnEscape = true,
  portal = false,
  backdropClassName,
  className,
  as: Element = 'div',
  role = 'dialog',
  label,
  labelledBy,
  describedBy,
  onKeyDown,
  boxRef,
  children,
}: DialogProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEscape, busy, onClose]);

  const dialog = (
    <div className={backdropClassName} onClick={() => !busy && onClose()}>
      <Element
        ref={boxRef}
        className={className}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </Element>
    </div>
  );
  return portal ? createPortal(dialog, document.body) : dialog;
}

type PresetProps = Omit<DialogProps, 'backdropClassName' | 'className'> & {
  // Classes ajoutées à celles du préréglage.
  backdropClassName?: string;
  className?: string;
};

const joinClasses = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

/** Fenêtre centrée (`.modal-backdrop` > `.modal`). */
export function Modal({ backdropClassName, className, ...props }: PresetProps) {
  return (
    <Dialog
      {...props}
      backdropClassName={joinClasses('modal-backdrop', backdropClassName)}
      className={joinClasses('modal', className)}
    />
  );
}

/** Tiroir latéral (`.fiche-crm-fond` > `.fiche-crm`). */
export function Drawer({ backdropClassName, className, ...props }: PresetProps) {
  return (
    <Dialog
      {...props}
      backdropClassName={joinClasses('fiche-crm-fond', backdropClassName)}
      className={joinClasses('fiche-crm', className)}
    />
  );
}

/** Bouton « Fermer » (croix) des fenêtres et des tiroirs. */
export function CloseButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="modal-close" aria-label="Fermer" onClick={onClick} disabled={disabled}>
      <X size={18} />
    </button>
  );
}

/** En-tête standard d'une fenêtre centrée : titre et bouton « Fermer ». */
export function ModalHeader({
  title,
  titleId,
  onClose,
  closeDisabled,
}: {
  title: ReactNode;
  titleId?: string;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <header className="modal-header">
      <h2 id={titleId}>{title}</h2>
      <CloseButton onClick={onClose} disabled={closeDisabled} />
    </header>
  );
}
