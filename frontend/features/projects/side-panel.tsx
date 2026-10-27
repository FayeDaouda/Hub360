'use client';

import type { ReactNode } from 'react';
import { CloseButton, Drawer } from '@/components/ui/dialog';

// Panneau latéral (tâche, fil d'une carte) : même tiroir que la fiche CRM —
// la liste reste en place derrière ; Échap ou un clic à côté referme.
export function SidePanel({
  title,
  header,
  onClose,
  children,
}: {
  title: string;
  header?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  // Portail : rendu dans un panneau en verre (backdrop-filter), le tiroir
  // « fixed » serait enfermé dans ce panneau au lieu de couvrir l'écran.
  return (
    <Drawer onClose={onClose} portal className="panneau-lateral" label={title}>
      <div className="fiche-crm-entete">
        <div>{header}</div>
        <CloseButton onClick={onClose} />
      </div>
      {children}
    </Drawer>
  );
}
