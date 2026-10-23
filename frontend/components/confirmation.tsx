'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ConfirmModal } from '@/components/admin/confirm-modal';

// Confirmation avant une action irréversible, dans la modale de l'app (plus
// de window.confirm du navigateur : non stylée, sans titre, bloquante, et
// ignorée dans certaines vues intégrées). Usage :
//   const confirmer = useConfirmer();
//   if (!(await confirmer({ titre: 'Supprimer le brouillon ?', message: '…', danger: true }))) return;
// Un seul fournisseur, au layout racine : la modale se rend hors de tout
// panneau à backdrop-filter, au-dessus des tiroirs et des autres modales.

export type DemandeConfirmation = {
  titre: string;
  message: ReactNode;
  confirmer?: string;
  annuler?: string;
  // Action destructrice : bouton rouge, focus initial sur « Annuler ».
  danger?: boolean;
};

type Demander = (demande: DemandeConfirmation) => Promise<boolean>;

const ContexteConfirmation = createContext<Demander | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [enCours, setEnCours] = useState<(DemandeConfirmation & { resoudre: (ok: boolean) => void }) | null>(null);

  const demander = useCallback<Demander>(
    (demande) =>
      new Promise<boolean>((resoudre) => {
        setEnCours({ ...demande, resoudre });
      }),
    [],
  );

  const repondre = (ok: boolean) => {
    enCours?.resoudre(ok);
    setEnCours(null);
  };

  return (
    <ContexteConfirmation.Provider value={demander}>
      {children}
      {enCours && (
        <ConfirmModal
          titre={enCours.titre}
          message={enCours.message}
          confirmer={enCours.confirmer}
          annuler={enCours.annuler}
          danger={enCours.danger}
          auPremierPlan
          onConfirm={() => repondre(true)}
          onClose={() => repondre(false)}
        />
      )}
    </ContexteConfirmation.Provider>
  );
}

export function useConfirmer(): Demander {
  const demander = useContext(ContexteConfirmation);
  if (!demander) throw new Error('useConfirmer : ConfirmationProvider absent du layout racine.');
  return demander;
}
