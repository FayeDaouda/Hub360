'use client';

import { useState } from 'react';
import type { ProjectSubmissionBody } from '@/features/projects/types';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  submissionBody,
  isSubmissionReady,
  EMPTY_SUBMISSION_ENTRY,
  type SubmissionEntry,
} from '@/features/projects/submission-entry';
import { DepositFields } from '@/features/projects/deposit-fields';
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
  initialFiles?: SubmissionEntry['pieces'];
  onSubmitted?: (r: MyTasksView) => void;
  onSend?: (body: ProjectSubmissionBody) => void;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<SubmissionEntry>({ ...EMPTY_SUBMISSION_ENTRY, pieces: initialFiles ?? [] });
  return (
    <ConfirmModal
      title="Déposer la tâche"
      message={
        <>
          <span className="depot-tache">
            « {task.libelle} » · {task.projetCode}
          </span>
          <DepositFields
            id={`remise-${task.id}`}
            baseName={task.nomDepot}
            reviewer={task.validateur}
            byDeposit={task.parDepot}
            required={task.fichierObligatoire}
            warning
            value={entry}
            onChange={setEntry}
          />
        </>
      }
      confirmLabel="Déposer"
      confirmDisabled={!isSubmissionReady(entry, task.fichierObligatoire)}
      onConfirm={async () => {
        if (onSend) onSend(submissionBody(entry));
        else onSubmitted?.(await submitTask(slug, task, submissionBody(entry)));
        onClose(); // ConfirmModal ne se ferme pas seule après succès
      }}
      onClose={onClose}
    />
  );
}
