'use client';

import { SubmissionEntryFields, type SubmissionEntry } from './submission-entry';

// Formulaire de dépôt d'une tâche — LE même depuis la liste « Mes tâches »
// (modale), « Mes performances » et le panneau de la tâche (lot F,
// 23/10/2026) : qui valide (nommé), fichiers (zone de dépôt, nom final),
// commentaire. Les boutons restent à l'appelant (modale ou panneau).
// Balisage en <span> : utilisable dans le message d'une ConfirmModal.
export function DepositFields({
  id,
  baseName,
  reviewer,
  byDeposit,
  required,
  warning = false,
  value,
  onChange,
}: {
  id: string;
  // Base du nom des fichiers du prochain dépôt, fournie par le serveur.
  baseName: string;
  // « Cheikh Fall (Architecte DPLG) » ; null : personne n'est encore désigné.
  reviewer: string | null;
  byDeposit: boolean; // sans temps atelier : le dépôt du justificatif vaut validation
  required: boolean;
  // Rappel « plus de nouveau dépôt avant la réponse » (modale de la liste).
  warning?: boolean;
  value: SubmissionEntry;
  onChange: (v: SubmissionEntry) => void;
}) {
  return (
    <span className="depot">
      <span className="depot-message">
        {byDeposit ? (
          'Le dépôt du justificatif vaut validation.'
        ) : (
          <>
            Part en validation chez <strong>{reviewer ?? 'un validateur à désigner'}</strong>.
          </>
        )}
        {warning &&
          !byDeposit &&
          ' Vous ne pourrez plus la déposer à nouveau tant qu’elle n’est pas validée ou renvoyée en reprise.'}
      </span>
      <SubmissionEntryFields id={id} value={value} onChange={onChange} required={required} baseName={baseName} />
    </span>
  );
}
