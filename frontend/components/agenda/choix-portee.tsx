'use client';

import { useCallback, useRef, useState } from 'react';
import { Repeat } from 'lucide-react';
import { CloseButton, Modal } from '@/components/ui/dialog';

export type Portee = 'occurrence' | 'suivantes' | 'toutes';

const CHOIX: { cle: Portee; libelle: string }[] = [
  { cle: 'occurrence', libelle: 'Cet événement' },
  { cle: 'suivantes', libelle: 'Cet événement et les suivants' },
  { cle: 'toutes', libelle: 'Tous les événements' },
];

// Sur une série (16/11/2026), comme Google Agenda : la modification,
// l'annulation ou le déplacement vaut pour cet événement, celui-ci et les
// suivants, ou toute la série. `demander` rend le choix, ou null (abandon).
export function useChoixPortee() {
  const [demande, setDemande] = useState<{ titre: string; action: string } | null>(null);
  const resoudre = useRef<((p: Portee | null) => void) | null>(null);
  const demander = useCallback(
    (titre: string, action: string) =>
      new Promise<Portee | null>((ok) => {
        resoudre.current = ok;
        setDemande({ titre, action });
      }),
    [],
  );
  const repondre = (p: Portee | null) => {
    resoudre.current?.(p);
    resoudre.current = null;
    setDemande(null);
  };
  const fenetre = demande ? (
    <ChoixPortee titre={demande.titre} action={demande.action} onChoix={repondre} onClose={() => repondre(null)} />
  ) : null;
  return { demander, fenetre };
}

function ChoixPortee({
  titre,
  action,
  onChoix,
  onClose,
}: {
  titre: string;
  action: string;
  onChoix: (p: Portee) => void;
  onClose: () => void;
}) {
  const [choix, setChoix] = useState<Portee>('occurrence');
  return (
    <Modal onClose={onClose} portal labelledBy="choix-portee-titre" className="agenda-portee">
      <header className="modal-header">
        <h2 id="choix-portee-titre">
          <Repeat size={18} aria-hidden /> {titre}
        </h2>
        <CloseButton onClick={onClose} />
      </header>
      <div className="modal-body agenda-portee-corps">
        <fieldset className="agenda-portee-choix">
          <legend className="sr-only">Portée</legend>
          {CHOIX.map((c) => (
            <label key={c.cle} className="agenda-invite">
              <input type="radio" name="portee" checked={choix === c.cle} onChange={() => setChoix(c.cle)} />
              {c.libelle}
            </label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Retour
          </button>
          <button type="button" className="btn-primary" onClick={() => onChoix(choix)}>
            {action}
          </button>
        </div>
      </div>
    </Modal>
  );
}
