'use client';

import { useCallback, useState } from 'react';

// Action d'un bloc du panneau d'une tâche (dépôt, décision, visa,
// assignation…) : un seul envoi à la fois pour tout le panneau, une seule
// erreur affichée, le dossier relu ensuite.
export type RunAction = (action: () => Promise<unknown>, fallback: string, after?: () => void) => Promise<void>;

export function useTaskAction(onUpdate: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback<RunAction>(
    async (action, fallback, after) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        after?.();
        await onUpdate();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : fallback);
      } finally {
        setBusy(false);
      }
    },
    [onUpdate],
  );

  // Lecture sans écriture (fichier d'une remise) : l'erreur seule.
  const read = useCallback(async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : fallback);
    }
  }, []);

  return { busy, error, run, read };
}
