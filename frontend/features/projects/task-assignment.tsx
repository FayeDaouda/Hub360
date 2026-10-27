'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@hub/domain';
import { assignTask, getTaskWorkload } from './api';
import { workloadLabel } from './labels';
import type { AssignableEmployee, ProjectCard, ProjectTask, TaskWorkload } from './types';
import type { RunAction } from './use-task-action';

type Props = {
  slug: string;
  projectId: string;
  card: ProjectCard;
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

// Assigner la tâche (ou toutes les tâches encore ouvertes de sa carte), avec
// la charge prévisionnelle de chacun sur la fenêtre de la tâche.
export function TaskAssignment({ slug, projectId, card, task: t, assignable, workload, busy, run }: Props) {
  const [wholeCard, setWholeCard] = useState(false);
  const loadOf = (id: string) => workload?.charges.find((c) => c.collaborateurId === id);
  const mine = t.assigne ? loadOf(t.assigne.id) : undefined;

  const assign = (employeeId: string) =>
    run(
      () => assignTask(slug, projectId, t.id, employeeId || null, wholeCard),
      'L’assignation a échoué.',
      // Portée « carte » : un seul usage, pour qu'un changement suivant ne
      // réassigne pas toute la carte par mégarde.
      () => setWholeCard(false),
    );

  return (
    <div className="po-panneau-bloc">
      <label className="tp-section" htmlFor="po-assigner">
        Assigner
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
      {card.taches.length > 1 && (
        <label className="po-case">
          <input type="checkbox" checked={wholeCard} disabled={busy} onChange={(e) => setWholeCard(e.target.checked)} />
          <span>Toute la carte « {card.libelle} » (ses tâches encore ouvertes)</span>
        </label>
      )}
    </div>
  );
}
