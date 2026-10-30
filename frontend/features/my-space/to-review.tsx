'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/lib/client-api';
import { decideTask, downloadSubmissionFile, getTasksToReview } from '@/features/my-tasks/api';
import type { TaskToReview } from '@/features/my-tasks/types';
import { formatDate } from '@hub/domain';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, FieldError } from '@/components/ui/field';
import { projectHref } from './project-link';
import { TeamRequests } from './team-requests';

// « Mon espace » · À valider (maquette du boss) : les demandes de l'équipe
// dont on est le N+1 ; et, quand il y en a, les remises des tâches du
// gabarit que l'on valide (chef d’équipe, Architecte DPLG en suppléance).
export function ToReview({ slug, onCount }: { slug: string; onCount: (n: number) => void }) {
  const [tasks, setTasks] = useState<TaskToReview[] | null>(null);
  const [absences, setAbsences] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getTasksToReview(slug)
      .then(setTasks)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Impossible de charger les tâches à valider.'));
  }, [slug]);
  useEffect(load, [load]);
  useEffect(() => {
    if (tasks) onCount(tasks.length + absences);
  }, [tasks, absences, onCount]);

  if (!tasks) {
    return error ? (
      <EmptyState>{error}</EmptyState>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }

  return (
    <>
      <TeamRequests slug={slug} onCount={setAbsences} />
      {error && <FieldError>{error}</FieldError>}
      {tasks.length > 0 && (
        <section className="panel glass-panel dmd-section">
          <h2 className="dmd-titre">Tâches remises à valider · {tasks.length}</h2>
          <ul className="dmd-liste">
            {tasks.map((t) => (
              <ReviewRow key={t.id} slug={slug} t={t} onDecide={setTasks} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Une remise : ses fichiers, puis valider ou renvoyer en reprise (motif).
function ReviewRow({ slug, t, onDecide }: { slug: string; t: TaskToReview; onDecide: (l: TaskToReview[]) => void }) {
  const base = usePathname().split('/mon-espace')[0];
  const [sendBack, setSendBack] = useState(false);
  const [motif, setMotif] = useState('');
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });

  async function decide(decision: 'valider' | 'renvoyer') {
    setState({ sending: true, error: null });
    try {
      onDecide(await decideTask(slug, t, decision, decision === 'renvoyer' ? motif : undefined));
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Décision non enregistrée.' });
    }
  }

  return (
    <li className="dmd-ligne">
      <span>
        <strong>
          {t.responsable} · {t.libelle}
        </strong>
        <span className="cell-sub">
          <Link className="lien-inline" href={projectHref(base, t.projetId)}>
            {t.projetCode}
          </Link>{' '}
          · {t.etape} · remise v{String(t.version).padStart(2, '0')}
          {t.remisLe && ` le ${formatDate(t.remisLe)}`}
          {t.echeance && ` · échéance ${formatDate(t.echeance)}`}
        </span>
        {/* Remise jugée par le back (task-rules.ts, onTime). */}
        {t.aTemps === false && <span className="cell-sub temps-alerte">Remis après l’échéance</span>}
        <span className="cell-sub">
          {t.pieces.length
            ? t.pieces.map((f, i) => (
                <span key={f.id}>
                  {i > 0 && ' · '}
                  <button
                    type="button"
                    className="po-fichier"
                    onClick={() =>
                      downloadSubmissionFile(slug, t, f.id).catch(() =>
                        setState({ sending: false, error: 'Fichier indisponible.' }),
                      )
                    }
                  >
                    {f.nom}
                  </button>
                </span>
              ))
            : 'Sans fichier joint'}
        </span>
        {sendBack && (
          <Field label="Motif du renvoi">
            <textarea
              className="field-input"
              rows={2}
              maxLength={1000}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </Field>
        )}
        {state.error && <span className="field-erreur">{state.error}</span>}
      </span>
      <span className="dmd-actions">
        {sendBack ? (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setSendBack(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={state.sending || !motif.trim()}
              onClick={() => decide('renvoyer')}
            >
              Renvoyer
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={state.sending}
              onClick={() => setSendBack(true)}
            >
              Renvoyer…
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={state.sending}
              onClick={() => decide('valider')}
            >
              Valider
            </button>
          </>
        )}
      </span>
    </li>
  );
}
