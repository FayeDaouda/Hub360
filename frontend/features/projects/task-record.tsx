'use client';

import { useEffect, useState } from 'react';
import { Infobulle } from '@/components/infobulle';
import { formatDate } from '@hub/domain';
import { getTaskHistory } from './api';
import type { ProjectTask, SubmissionPiece, TaskEvent } from './types';

// Fichiers déposés (v01, v02…) et historique d'une tâche.

export function SubmittedFiles({
  code,
  pieces,
  onOpen,
}: {
  code: string;
  pieces: SubmissionPiece[];
  onOpen: (pieceId: string) => void;
}) {
  return (
    <div className="po-panneau-bloc">
      <p className="tp-section">
        Fichiers déposés{' '}
        <Infobulle>Une version par dépôt (v01, v02…). Convention de nommage : {code}_ÉTAPE_LIVRABLE_vNN.</Infobulle>
      </p>
      {pieces.length ? (
        <ul className="po-historique">
          {pieces.map((f) => (
            <li key={f.id}>
              v{String(f.version).padStart(2, '0')} ·{' '}
              <button type="button" className="po-fichier" onClick={() => onOpen(f.id)}>
                {f.nom}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="po-aide">Aucun fichier.</p>
      )}
    </div>
  );
}

// Relu quand la tâche change, que son assigné change, ou après une remise /
// décision / visa : la nouvelle ligne apparaît aussitôt. Pendant la lecture,
// « Chargement… » (l'historique lu pour un autre état ne s'affiche pas).
export function TaskHistory({ slug, projectId, task }: { slug: string; projectId: string; task: ProjectTask }) {
  const key = [task.id, task.assigne?.id, task.statut, task.version, task.visa?.le].join(':');
  const [loaded, setLoaded] = useState<{ key: string; events: TaskEvent[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTaskHistory(slug, projectId, task.id)
      .then((events) => !cancelled && setLoaded({ key, events }))
      .catch(() => !cancelled && setLoaded({ key, events: [] }));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId, task.id, key]);
  const history = loaded?.key === key ? loaded.events : null;

  return (
    <div className="po-panneau-bloc">
      <p className="tp-section">Historique</p>
      {!history ? (
        <p className="po-aide">Chargement…</p>
      ) : history.length === 0 ? (
        <p className="po-aide">Aucun événement.</p>
      ) : (
        <ul className="po-historique">
          {history.map((e) => (
            <li key={e.id}>
              {formatDate(e.le)} · {e.detail}
              {e.par && ` par ${e.par}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
