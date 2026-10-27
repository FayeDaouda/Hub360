'use client';

import { Infobulle } from '@/components/infobulle';
import { requestExtension, submitProjectTask } from './api';
import { DepositFields } from './deposit-fields';
import { EMPTY_SUBMISSION_ENTRY, isSubmissionReady, submissionBody, type SubmissionEntry } from './submission-entry';
import type { ProjectTask } from './types';
import type { RunAction } from './use-task-action';

// Formulaires ouverts sous la barre d'actions du panneau (un seul à la fois).
// Leur saisie est tenue par le panneau : fermé puis rouvert, le formulaire la
// retrouve ; elle n'est vidée qu'après l'envoi.

type Common = {
  slug: string;
  projectId: string;
  task: ProjectTask;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
};

export function DepositForm({
  slug,
  projectId,
  task: t,
  busy,
  run,
  onClose,
  entry,
  onEntry,
}: Common & { entry: SubmissionEntry; onEntry: (v: SubmissionEntry) => void }) {
  const v = t.validation;
  return (
    <div className="po-panneau-bloc tp-formulaire">
      <p className="tp-section">
        {t.statut === 'reprise' ? 'Reprise demandée' : 'Dépôt'} · v{String(t.version + 1).padStart(2, '0')}
      </p>
      <DepositFields
        id={`po-remise-${t.id}`}
        baseName={t.nomDepot}
        reviewer={v.mode === 'personne' && v.nom ? `${v.nom} (${v.role})` : null}
        byDeposit={v.mode === 'depot'}
        required={t.fichierObligatoire}
        value={entry}
        onChange={onEntry}
      />
      <div className="po-decision">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !isSubmissionReady(entry, t.fichierObligatoire)}
          onClick={() =>
            run(
              () => submitProjectTask(slug, projectId, t.id, submissionBody(entry)),
              'La remise a échoué.',
              () => {
                onEntry(EMPTY_SUBMISSION_ENTRY);
                onClose();
              },
            )
          }
        >
          {busy ? '…' : v.mode === 'depot' ? 'Déposer le justificatif' : 'Déposer'}
        </button>
      </div>
    </div>
  );
}

export type ExtensionEntry = { until: string; reason: string };

export function ExtensionRequestForm({
  slug,
  projectId,
  task: t,
  busy,
  run,
  onClose,
  entry,
  onEntry,
}: Common & { entry: ExtensionEntry; onEntry: (v: ExtensionEntry) => void }) {
  return (
    <div className="po-panneau-bloc tp-formulaire">
      <p className="tp-section">
        Demander un délai{' '}
        <Infobulle>
          Votre N+1 accorde ou refuse. Accordé, le retard est qualifié jusqu’à la nouvelle date ; l’échéance de
          référence ne change pas.
        </Infobulle>
      </p>
      <label className="po-panneau-label" htmlFor="po-jusquau">
        Nouvelle date
      </label>
      <input
        id="po-jusquau"
        className="field-input"
        type="date"
        value={entry.until}
        min={t.finLe ?? undefined}
        onChange={(e) => onEntry({ ...entry, until: e.target.value })}
      />
      <label className="po-panneau-label" htmlFor="po-motif-prolongation">
        Motif
      </label>
      <textarea
        id="po-motif-prolongation"
        className="field-input"
        rows={2}
        maxLength={500}
        value={entry.reason}
        onChange={(e) => onEntry({ ...entry, reason: e.target.value })}
      />
      <div className="po-decision">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !entry.until || entry.reason.trim().length < 3}
          onClick={() =>
            run(
              () => requestExtension(slug, projectId, t.id, entry.until, entry.reason.trim()),
              'La demande a échoué.',
              onClose,
            )
          }
        >
          Envoyer la demande
        </button>
      </div>
    </div>
  );
}
