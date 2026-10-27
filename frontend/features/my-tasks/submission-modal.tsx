'use client';

import { useState } from 'react';
import type { CorpsRemise } from '@/lib/projets-ouverts';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  corpsRemise,
  depotPret,
  SAISIE_REMISE_VIDE,
  type SaisieRemise,
} from '@/components/projets-ouverts/champs-remise';
import { FormulaireDepot } from '@/components/projets-ouverts/formulaire-depot';
import { submitTask } from './api';
import type { MyTask, MyTasksView } from './types';

// Remise d'une tâche au N+1 — même formulaire (FormulaireDepot) depuis « Mes
// tâches », « Mon espace › Mes performances » et le panneau de la tâche.
// Deux modes : envoi immédiat (onSubmitted reçoit la réponse), ou envoi
// confié à l'appelant (onSend reçoit le corps — « Mes tâches » le diffère de
// quelques secondes pour proposer « Annuler »).
export function SubmissionModal({
  slug,
  task,
  initialFiles,
  onSubmitted,
  onSend,
  onClose,
}: {
  slug: string;
  task: MyTask;
  // Fichiers glissés sur la ligne de la tâche (« Mes tâches »).
  initialFiles?: SaisieRemise['pieces'];
  onSubmitted?: (r: MyTasksView) => void;
  onSend?: (body: CorpsRemise) => void;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<SaisieRemise>({ ...SAISIE_REMISE_VIDE, pieces: initialFiles ?? [] });
  return (
    <ConfirmModal
      title="Déposer la tâche"
      message={
        <>
          <span className="depot-tache">
            « {task.libelle} » · {task.projetCode}
          </span>
          <FormulaireDepot
            id={`remise-${task.id}`}
            nommage={{
              code: task.projetCode,
              etapeNumero: task.etapeNumero,
              tache: task.libelle,
              version: task.version + 1,
            }}
            validateur={task.validateur}
            parDepot={task.parDepot}
            obligatoire={task.fichierObligatoire}
            avertissement
            valeur={entry}
            onChange={setEntry}
          />
        </>
      }
      confirmLabel="Déposer"
      confirmDisabled={!depotPret(entry, task.fichierObligatoire)}
      onConfirm={async () => {
        if (onSend) onSend(corpsRemise(entry));
        else onSubmitted?.(await submitTask(slug, task, corpsRemise(entry)));
        onClose(); // ConfirmModal ne se ferme pas seule après succès
      }}
      onClose={onClose}
    />
  );
}
