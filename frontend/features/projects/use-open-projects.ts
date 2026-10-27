'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMyTasks } from '@/features/my-tasks/api';
import { getAssignableEmployees, getBoard, getMentionablePeople, getMyMentions, getProjectFile } from './api';
import { defaultStep, type EmployeeCounts } from './project-tiles';
import type { AssignableEmployee, OpenProjectFile, OpenProjectsBoard } from './types';

// Panneau latéral : une tâche, ou le fil d'une carte.
export type Selection = { type: 'tache' | 'carte'; id: string } | null;
type TaskRef = { projetId: string; tacheId: string };

type Options = {
  // « Lecture et assignation » : la liste n'est chargée que pour qui assigne.
  canAssign: boolean;
  // Fil en écriture : qui écrit sur Projets, le Salarié sur ses projets, CEO et CFO.
  canWriteThreads: boolean;
  // Salarié : tuiles de SES tâches.
  employee: boolean;
};

// Carte d'une tâche à ouvrir dans le dossier (null : tâche absente).
const cardOf = (file: OpenProjectFile, taskId: string) =>
  file.cartes.find((c) => c.taches.some((t) => t.id === taskId)) ?? null;

// Données de la page Projets : tableau, dossier du projet choisi (étape,
// sélection), personnes assignables et mentionnables, compteurs du Salarié.
export function useOpenProjects(slug: string, { canAssign, canWriteThreads, employee }: Options) {
  const [board, setBoard] = useState<OpenProjectsBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?projet= : lien d'une notification (mention dans un fil) ; &tache= : la
  // tâche à ouvrir (« À décider aujourd'hui » du Dir. GC).
  const params = useSearchParams();
  const requestedProject = params.get('projet');
  const requestedTask = params.get('tache');
  const [projectId, setProjectId] = useState<string | null>(requestedProject);
  const [file, setFile] = useState<OpenProjectFile | null>(null);
  const [step, setStep] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  // Remise à ouvrir dès que son dossier arrive (lien, « À valider par vous »).
  const pendingOpen = useRef<TaskRef | null>(
    requestedProject && requestedTask ? { projetId: requestedProject, tacheId: requestedTask } : null,
  );
  const [counts, setCounts] = useState<EmployeeCounts | null>(null);
  const [assignable, setAssignable] = useState<AssignableEmployee[] | null>(null);
  const [mentionable, setMentionable] = useState<{ id: string; nom: string }[] | null>(null);

  const loadBoard = useCallback(
    () =>
      getBoard(slug)
        .then((b) => {
          setBoard(b);
          setProjectId((id) => id ?? b.projets[0]?.id ?? null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Lecture impossible.')),
    [slug],
  );
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (canAssign) {
      getAssignableEmployees(slug)
        .then(setAssignable)
        .catch(() => setAssignable(null));
    }
    if (canWriteThreads) {
      getMentionablePeople(slug)
        .then(setMentionable)
        .catch(() => setMentionable(null));
    }
  }, [slug, canAssign, canWriteThreads]);

  // Après une écriture : le dossier et les tuiles relus, la tâche choisie gardée.
  const loadCounts = useCallback(() => {
    if (!employee) return;
    Promise.all([getMyTasks(slug), getMyMentions(slug)])
      .then(([t, m]) =>
        setCounts({
          reprises: t.taches.filter((x) => x.statut === 'a_reprendre').length,
          // Même règle que « Mes tâches » (calculée au back) : reprises en retard comprises.
          retards: t.taches.filter((x) => x.statut !== 'validee' && x.enRetard).length,
          attente: t.taches.filter((x) => x.statut === 'remise').length,
          mentions: m.filter((x) => !x.lue).length,
        }),
      )
      .catch(() => setCounts(null));
  }, [slug, employee]);
  useEffect(loadCounts, [loadCounts]);

  const reload = useCallback(async () => {
    if (projectId) setFile(await getProjectFile(slug, projectId));
    await loadBoard();
    loadCounts();
  }, [slug, projectId, loadBoard, loadCounts]);

  // Dossier du projet choisi ; à son arrivée, l'étape par défaut, ou celle de
  // la remise demandée avec son panneau ouvert.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProjectFile(slug, projectId)
      .then((d) => {
        if (cancelled) return;
        setFile(d);
        const open = pendingOpen.current?.projetId === d.id ? pendingOpen.current : null;
        const card = open && cardOf(d, open.tacheId);
        if (open) pendingOpen.current = null;
        setStep(card ? card.etapeNumero : defaultStep(d));
        if (card) setSelection({ type: 'tache', id: open.tacheId });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Lecture impossible.'));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId]);

  // Un autre projet : son dossier repart de zéro (squelette, aucun panneau).
  const selectProject = useCallback(
    (id: string) => {
      if (id === projectId) return;
      setFile(null);
      setSelection(null);
      setProjectId(id);
    },
    [projectId],
  );

  // « À valider par vous » : la première remise, dans son dossier.
  const openFirstToReview = useCallback(() => {
    const first = board?.kpi.aValiderParVous[0];
    if (!first) return;
    const card = file?.id === first.projetId ? cardOf(file, first.tacheId) : null;
    if (file?.id === first.projetId) {
      if (card) {
        setStep(card.etapeNumero);
        setSelection({ type: 'tache', id: first.tacheId });
      }
      return;
    }
    pendingOpen.current = first;
    selectProject(first.projetId);
  }, [board, file, selectProject]);

  return {
    board,
    error,
    projectId,
    selectProject,
    file,
    step,
    setStep,
    selection,
    setSelection,
    counts,
    assignable,
    mentionable,
    reload,
    openFirstToReview,
  };
}
