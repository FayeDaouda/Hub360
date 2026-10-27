'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getMentionablePeople, getProjectFile } from '@/features/projects/api';
import type { OpenProjectFile } from '@/features/projects/types';
import { PanneauLateral } from '@/components/projets-ouverts/panneau-lateral';
import { TaskPanel } from '@/features/projects/task-panel';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

// Tâche ouverte en panneau latéral depuis « Mes tâches » (revue Salarié
// 19/10/2026) : le panneau de Projets tel quel — descriptif, remise,
// prolongation, versions, fil de discussion, historique — sans quitter la
// liste. Lecture seule pour l'assignation (le Salarié n'assigne pas).
// En-tête : une ligne fine projet · client (le titre est celui de la tâche,
// dans le panneau). J / K : tâche précédente / suivante sans fermer.
export function TaskDrawer({
  slug,
  projectId,
  taskId,
  meId,
  extension,
  onChange,
  onClose,
  onNeighbour,
}: {
  slug: string;
  projectId: string;
  taskId: string;
  meId: string;
  // Ouvre directement la demande de délai (prolongation).
  extension: boolean;
  onChange: () => void;
  onClose: () => void;
  // J / K : ouvrir la tâche précédente (-1) ou suivante (+1) de la liste.
  onNeighbour?: (step: -1 | 1) => void;
}) {
  const [project, setProject] = useState<OpenProjectFile | null>(null);
  const [mentionable, setMentionable] = useState<{ id: string; nom: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getProjectFile(slug, projectId)
        .then(setProject)
        .catch((e) => setError(e instanceof Error && e.message ? e.message : 'Tâche indisponible.')),
    [slug, projectId],
  );
  // Un panneau par tâche : « Mes tâches » le remonte à chaque tâche ouverte
  // (key), son état repart donc vide sans être remis à zéro ici.
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    getMentionablePeople(slug)
      .then(setMentionable)
      .catch(() => setMentionable(null));
  }, [slug]);

  useEffect(() => {
    if (!onNeighbour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'j' && e.key !== 'k')) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('.modal-backdrop')
      )
        return;
      e.preventDefault();
      onNeighbour(e.key === 'j' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNeighbour]);

  const card = project?.cartes.find((c) => c.taches.some((t) => t.id === taskId));
  const task = card?.taches.find((t) => t.id === taskId);

  return (
    <PanneauLateral
      titre="Tâche"
      onClose={onClose}
      entete={
        <p className="tp-fil">
          <span className="tp-fil-code">{project?.code ?? '…'}</span>
          {project && (
            <>
              {' · '}
              {project.client.nom} ·{' '}
              <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${projectId}`}>
                Ouvrir le projet
              </Link>
            </>
          )}
        </p>
      }
    >
      {error && <FieldError>{error}</FieldError>}
      {!project && !error && <Skeleton />}
      {project && card && task ? (
        // key : une autre tâche (J / K) ou l'ouverture sur « Demander un
        // délai » = un panneau neuf, sa saisie repart de zéro.
        <TaskPanel
          key={`${task.id}:${extension}`}
          slug={slug}
          projectId={projectId}
          code={project.code}
          card={card}
          task={task}
          assignable={null}
          meId={meId}
          mentionable={mentionable}
          extensionOpen={extension}
          onUpdate={async () => {
            await load();
            onChange();
          }}
        />
      ) : (
        project && <p className="dmd-note">Cette tâche n’est plus dans le projet.</p>
      )}
    </PanneauLateral>
  );
}
