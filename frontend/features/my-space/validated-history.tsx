import Link from 'next/link';
import { formatDate } from '@hub/domain';
import type { MyTask } from '@/features/my-tasks/types';
import { Pill } from '@/components/ui/pill';
import { projectHref } from './project-link';

// Historique des tâches validées, la plus récente d'abord : reprises et
// remise à temps (jugée par le back) de chacune.
export function ValidatedHistory({ tasks, base }: { tasks: MyTask[]; base: string }) {
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Tâches validées · {tasks.length}</h2>
      {tasks.length === 0 ? (
        <p className="dmd-note">Aucune tâche validée pour l’instant.</p>
      ) : (
        <ul className="dmd-liste">
          {tasks.map((t) => (
            <li key={t.id} className="dmd-ligne">
              <span>
                <strong>{t.libelle}</strong>
                <span className="cell-sub">
                  <Link className="lien-inline" href={projectHref(base, t.projetId)}>
                    {t.projetCode}
                  </Link>{' '}
                  · {t.etape}
                  {t.valideLe && ` · validée le ${formatDate(t.valideLe)}`}
                </span>
              </span>
              <span className="dmd-actions">
                {t.version > 1 && (
                  <Pill tone="attention">
                    {t.version - 1} reprise{t.version > 2 ? 's' : ''}
                  </Pill>
                )}
                {t.aTemps === null ? (
                  <Pill tone="neutre">sans remise datée</Pill>
                ) : t.aTemps ? (
                  <Pill tone="succes">à temps</Pill>
                ) : (
                  <Pill tone="risque">remise après l’échéance</Pill>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
