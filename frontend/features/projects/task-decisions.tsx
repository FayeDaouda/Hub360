'use client';

import { useState } from 'react';
import { formatDate } from '@hub/domain';
import { decideExtension, decideProjectTask, setTaskVisa } from './api';
import type { ProjectTask } from './types';
import type { RunAction } from './use-task-action';

// Décisions du panneau d'une tâche : délai demandé, visa DPLG, remise à
// valider. Droits revérifiés par le serveur.

type Props = { slug: string; projectId: string; task: ProjectTask; busy: boolean; run: RunAction };

// Délai demandé par l'assigné : accordé (retard qualifié) ou refusé.
export function ExtensionDecision({ slug, projectId, task: t, busy, run }: Props) {
  const pending = t.prolongation.enAttente!;
  return (
    <div className="po-panneau-bloc">
      <p className="tp-section">Délai demandé</p>
      <p className="po-aide">
        Jusqu’au {formatDate(pending.jusquau)} : {pending.motif}
      </p>
      {t.peutDeciderProlongation ? (
        <div className="po-decision">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => run(() => decideExtension(slug, projectId, t.id, false), 'La décision a échoué.')}
          >
            Refuser
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => run(() => decideExtension(slug, projectId, t.id, true), 'La décision a échoué.')}
          >
            Accorder (retard qualifié)
          </button>
        </div>
      ) : (
        <p className="po-aide">En attente de la réponse du validateur.</p>
      )}
    </div>
  );
}

// Visa DPLG (revue Dir. GC) : validée par le chef d’équipe, la tâche attend la
// signature de l'architecte ; apposé, il est daté et nommé.
export function VisaDecision({ slug, projectId, task: t, busy, run }: Props) {
  // Refus en cours de saisie (motif obligatoire) ; null : pas de refus ouvert.
  const [refusal, setRefusal] = useState<string | null>(null);
  const visa = t.visa!;
  return (
    <div className="po-panneau-bloc">
      <p className="tp-section">Visa DPLG</p>
      {visa.nonTrace ? (
        <p className="po-aide">
          Visa non tracé (antérieur au 21/10/2026) : la tâche a été validée avant la règle du visa.
        </p>
      ) : visa.le ? (
        <p className="po-aide">
          Apposé le {formatDate(visa.le)}
          {visa.par ? ` par ${visa.par}` : ''}.
        </p>
      ) : (
        <p className="po-aide">
          Validée par le chef d’équipe : le visa de l’architecte DPLG est attendu avant la suite.
        </p>
      )}
      {t.peutViser &&
        (refusal !== null ? (
          <>
            <label className="po-panneau-label" htmlFor="po-motif-visa">
              Motif du refus (la tâche repart en reprise)
            </label>
            <textarea
              id="po-motif-visa"
              className="field-input"
              rows={2}
              maxLength={500}
              value={refusal}
              onChange={(e) => setRefusal(e.target.value)}
            />
            <div className="po-decision">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setRefusal(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || refusal.trim().length < 3}
                onClick={() =>
                  run(
                    () => setTaskVisa(slug, projectId, t.id, false, refusal.trim()),
                    'Le refus a échoué.',
                    () => setRefusal(null),
                  )
                }
              >
                Refuser le visa
              </button>
            </div>
          </>
        ) : (
          <div className="po-decision">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setRefusal('')}>
              Refuser le visa
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => run(() => setTaskVisa(slug, projectId, t.id, true), 'Le visa a échoué.')}
            >
              Apposer le visa DPLG
            </button>
          </div>
        ))}
    </div>
  );
}

// Remise de la version en cours à valider : fichiers, puis valider ou
// renvoyer en reprise avec un motif.
export function SubmissionReview({
  slug,
  projectId,
  task: t,
  busy,
  run,
  onOpenFile,
}: Props & { onOpenFile: (pieceId: string) => void }) {
  const [sendBack, setSendBack] = useState(false);
  const [reason, setReason] = useState('');
  const files = t.pieces.filter((f) => f.version === t.version);
  const decide = (decision: 'valider' | 'renvoyer') =>
    run(
      () => decideProjectTask(slug, projectId, t.id, decision, decision === 'renvoyer' ? reason.trim() : undefined),
      'La décision a échoué.',
      () => {
        setSendBack(false);
        setReason('');
      },
    );
  return (
    <div className="po-panneau-bloc">
      <p className="tp-section">Remise v{String(t.version).padStart(2, '0')} à valider</p>
      {files.length ? (
        <ul className="po-historique">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" className="po-fichier" onClick={() => onOpenFile(f.id)}>
                {f.nom}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="po-aide">Sans fichier joint.</p>
      )}
      {sendBack ? (
        <>
          <label className="po-panneau-label" htmlFor="po-motif">
            Motif de la reprise
          </label>
          <textarea
            id="po-motif"
            className="field-input"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="po-decision">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setSendBack(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => decide('renvoyer')}
            >
              Renvoyer en reprise
            </button>
          </div>
        </>
      ) : (
        <div className="po-decision">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setSendBack(true)}>
            Renvoyer en reprise
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => decide('valider')}>
            Valider la remise
          </button>
        </div>
      )}
    </div>
  );
}
