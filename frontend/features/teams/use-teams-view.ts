'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAbsencesAValider } from '@/lib/demandes';
import { getTeamsView } from './api';
import type { TeamsView } from './types';

// Données de la page Équipes : la vue (une lecture, le serveur fait foi) et le
// nombre d'absences qui attendent la décision de l'utilisateur (null tant
// qu'il n'est pas connu). `error` sert aussi aux actions de la page.
export function useTeamsView(slug: string) {
  const [view, setView] = useState<TeamsView | null>(null);
  const [pendingAbsences, setPendingAbsences] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getTeamsView(slug)
      .then(setView)
      .catch((e) => setError(e instanceof Error ? e.message : 'Équipes indisponibles.'));
  }, [slug]);

  useEffect(() => {
    reload();
    getAbsencesAValider(slug)
      .then((l) => setPendingAbsences(l.length))
      .catch(() => setPendingAbsences(0));
  }, [slug, reload]);

  // Une action de la page : en cas de réussite la vue est relue, sinon le
  // message du serveur (règles de cellule, 409) ou le repli s'affiche.
  const run = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setError(null);
      try {
        await action();
        reload();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : fallback);
      }
    },
    [reload],
  );

  return { view, pendingAbsences, setPendingAbsences, error, reload, run };
}
