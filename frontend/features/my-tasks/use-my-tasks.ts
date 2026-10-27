'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider } from '@/lib/demandes';
import { getMyMentions } from '@/features/projects/api';
import type { MyMention } from '@/features/projects/types';
import { getMyTasks, getTasksToReview, remindReviewer, submitTask } from './api';
import type { MyTask, MyTasksView, SubmissionBody } from './types';
import { animate } from './view-transition';

// Délai pendant lequel un dépôt peut être annulé (envoi différé, aucune
// annulation côté serveur).
export const UNDO_DELAY_MS = 5000;

// Relance du validateur d'une tâche : en cours, envoyée, ou refusée (motif).
export type Reminder = 'envoi' | 'ok' | { erreur: string };

// Données et actions de « Mes tâches » : la liste (le serveur fait foi), les
// mentions, ce qui attend la décision de la personne (N+1), la relance du
// validateur et les dépôts différés.
export function useMyTasks(slug: string) {
  const [data, setData] = useState<MyTasksView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MyMention[]>([]);
  const [toDecide, setToDecide] = useState({ taches: 0, absences: 0 });
  // Relance du validateur, par tâche (aside « Chez mon N+1 »).
  const [reminders, setReminders] = useState<Record<string, Reminder>>({});
  // Dépôts différés : affichés comme déposés tout de suite, envoyés après
  // UNDO_DELAY_MS sauf « Annuler ». Le détail vit dans une ref (lu par les
  // minuteries), la liste des ids dans l'état (rendu).
  const pending = useRef(new Map<string, { task: MyTask; body: SubmissionBody; timer: number }>());
  const [sending, setSending] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: string; libelle: string } | null>(null);

  const reloadTasks = useCallback(
    () =>
      getMyTasks(slug)
        .then(setData)
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.')),
    [slug],
  );
  const reloadMentions = useCallback(
    () =>
      getMyMentions(slug)
        .then(setMentions)
        .catch(() => setMentions([])),
    [slug],
  );
  useEffect(() => {
    void reloadTasks();
    void reloadMentions();
    // Complément : son échec ne bloque pas la liste.
    Promise.all([getTasksToReview(slug), getAbsencesAValider(slug)])
      .then(([t, a]) => setToDecide({ taches: t.length, absences: a.length }))
      .catch(() => setToDecide({ taches: 0, absences: 0 }));
  }, [slug, reloadTasks, reloadMentions]);

  // Quitter la page pendant le délai d'annulation : les dépôts partent tout
  // de suite (rien n'est perdu) ; fermer l'onglet demande confirmation.
  useEffect(() => {
    const inProgress = pending.current;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (inProgress.size) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      for (const d of inProgress.values()) {
        clearTimeout(d.timer);
        void submitTask(slug, d.task, d.body).catch(() => undefined);
      }
      inProgress.clear();
    };
  }, [slug]);

  // Relance du validateur : la liste revient du serveur (prochaine relance
  // repoussée de 3 jours ouvrés) ; « Relance envoyée » reste affiché.
  async function remind(t: MyTask) {
    setReminders((r) => ({ ...r, [t.id]: 'envoi' }));
    try {
      setData(await remindReviewer(slug, t));
      setReminders((r) => ({ ...r, [t.id]: 'ok' }));
    } catch (e) {
      setReminders((r) => ({ ...r, [t.id]: { erreur: e instanceof Error ? e.message : 'Relance impossible.' } }));
    }
  }

  // Dépôt confirmé dans la fenêtre : affiché comme fait, envoyé après le
  // délai d'annulation.
  function submitLater(t: MyTask, body: SubmissionBody) {
    setError(null);
    const timer = window.setTimeout(() => void send(t.id), UNDO_DELAY_MS);
    pending.current.set(t.id, { task: t, body, timer });
    animate(() => setSending((ids) => [...ids.filter((x) => x !== t.id), t.id]));
    setToast({ id: t.id, libelle: t.libelle });
  }
  async function send(id: string) {
    const d = pending.current.get(id);
    if (!d) return;
    pending.current.delete(id);
    setToast((x) => (x?.id === id ? null : x));
    try {
      setData(await submitTask(slug, d.task, d.body));
      setSending((ids) => ids.filter((x) => x !== id));
    } catch (e) {
      // Échec : la tâche revient à sa place, avec le motif.
      animate(() => setSending((ids) => ids.filter((x) => x !== id)));
      setError(`Le dépôt de « ${d.task.libelle} » a échoué : ${e instanceof Error ? e.message : 'erreur inconnue'}.`);
    }
  }
  function cancelSubmission(id: string) {
    const d = pending.current.get(id);
    if (!d) return;
    clearTimeout(d.timer);
    pending.current.delete(id);
    setToast(null);
    animate(() => setSending((ids) => ids.filter((x) => x !== id)));
  }

  return {
    data,
    error,
    setError,
    mentions,
    toDecide,
    reminders,
    sending,
    toast,
    reloadTasks,
    reloadMentions,
    remind,
    submitLater,
    cancelSubmission,
  };
}
