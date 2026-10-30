'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@hub/domain';
import { assignTask, getTaskWorkload } from './api';
import { workloadLabel } from './labels';
import type { AssignableEmployee, ProjectTask, TaskWorkload } from './types';
import type { RunAction } from './use-task-action';

type Props = {
  slug: string;
  projectId: string;
  task: ProjectTask;
  assignable: AssignableEmployee[];
  workload: TaskWorkload | null;
  busy: boolean;
  run: RunAction;
};

// Charge de chacun sur la fenêtre de la tâche, pour qui peut assigner (même
// quand le bloc « Assigner » est masqué). Relue quand la tâche ou son assigné
// change (la charge bouge avec) ; celle lue pour un autre assigné ne
// s'affiche pas.
export function useTaskWorkload(slug: string, projectId: string, task: ProjectTask, enabled: boolean) {
  const key = `${task.id}:${task.assigne?.id ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; workload: TaskWorkload | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getTaskWorkload(slug, projectId, task.id)
      .then((workload) => !cancelled && setLoaded({ key, workload }))
      .catch(() => !cancelled && setLoaded({ key, workload: null }));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId, task.id, key, enabled]);
  return loaded?.key === key ? loaded.workload : null;
}

// Assigner CETTE tâche (le bloc entier s'assigne depuis l'en-tête de la
// carte, 30/10/2026), avec la charge prévisionnelle de chacun sur sa fenêtre.
export function TaskAssignment({ slug, projectId, task: t, assignable, workload, busy, run }: Props) {
  const loadOf = (id: string) => workload?.charges.find((c) => c.collaborateurId === id);
  const mine = t.assigne ? loadOf(t.assigne.id) : undefined;

  const assign = (employeeId: string) =>
    run(() => assignTask(slug, projectId, t.id, employeeId || null, false), 'L’assignation a échoué.');

  return (
    <div className="po-panneau-bloc">
      <label className="tp-section" htmlFor="po-assigner">
        Assigner cette tâche
      </label>
      <select
        id="po-assigner"
        className="field-input"
        value={t.assigne?.id ?? ''}
        disabled={busy}
        onChange={(e) => assign(e.target.value)}
      >
        <option value="">À assigner</option>
        {assignable.map((a) => {
          const load = workloadLabel(loadOf(a.id), workload?.zone ?? null);
          return (
            <option key={a.id} value={a.id}>
              {a.nom}
              {a.cellule ? ` · ${a.cellule}` : ''}
              {load ? ` — ${load}` : ''}
            </option>
          );
        })}
      </select>
      {workload?.periode && (
        <p className="po-aide">
          Charge prévisionnelle du {formatDate(workload.periode.debut)} au {formatDate(workload.periode.fin)}, cette
          tâche comprise
          {workload.zone ? ` (zone normale ${workload.zone.de} à ${workload.zone.a} %)` : ''}.
          {t.assigne && mine && (
            <>
              {' '}
              {t.assigne.nom} : {mine.assignees} h déjà prévues sur {mine.disponibles} h disponibles
              {mine.joursAbsence ? `, ${mine.joursAbsence} j d’absence` : ''}.
            </>
          )}
        </p>
      )}
    </div>
  );
}
