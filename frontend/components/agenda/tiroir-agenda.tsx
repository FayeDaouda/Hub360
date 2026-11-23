'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseButton, Dialog } from '@/components/ui/dialog';

// Tiroir de l'Agenda (sous 1100px, 18/11/2026) : vues, mini-calendrier,
// agendas. Il glisse depuis la gauche, dans un portail (jamais rogné par le
// verre). Le focus y entre à l'ouverture (la croix) et revient au bouton qui
// l'a ouvert à la fermeture ; Tab reste dedans.
export function TiroirAgenda({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLElement>('.modal-close')?.focus({ preventScroll: true });
    return () => avant?.focus?.({ preventScroll: true });
  }, []);
  return (
    <Dialog
      onClose={onClose}
      portal
      backdropClassName="agenda-tiroir-fond"
      className="agenda-tiroir"
      label="Vues et agendas"
      trapFocus
      boxRef={boite}
    >
      <div className="agenda-tiroir-tete">
        <strong>Agenda</strong>
        <CloseButton onClick={onClose} />
      </div>
      {children}
    </Dialog>
  );
}
