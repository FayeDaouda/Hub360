'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate, formatDayMonth, formatHours } from '@hub/domain';
import { statusLabel, TASK_STATUS_LABELS } from '@/features/my-tasks/task-status';
import type { MyTask } from '@/features/my-tasks/types';
import { LIBELLE_MANQUE } from '@/lib/temps';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';
import { projectHref } from './project-link';

type Filter = 'toutes' | 'en_cours' | 'en_retard' | 'validees';

const FILTERS: { key: Filter; label: string; keep: (t: MyTask) => boolean }[] = [
  { key: 'toutes', label: 'Toutes', keep: () => true },
  { key: 'en_cours', label: 'En cours', keep: (t) => t.statut !== 'validee' },
  { key: 'en_retard', label: 'En retard', keep: (t) => t.statut === 'en_retard' },
  { key: 'validees', label: 'Validées', keep: (t) => t.statut === 'validee' },
];

// Rôles sans la page « Mes tâches » : la liste des tâches assignées, leur
// temps (calculé, non modifiable) et leur dépôt au N+1.
export function AssignedTasksTable({
  tasks,
  base,
  today,
  error,
  onSubmit,
}: {
  tasks: MyTask[];
  base: string;
  today: string;
  error: string | null;
  onSubmit: (t: MyTask) => void;
}) {
  const [filter, setFilter] = useState<Filter>('toutes');
  const shown = tasks.filter(FILTERS.find((f) => f.key === filter)!.keep);
  return (
    <section className="panel glass-panel dmd-section temps-panel">
      <div className="temps-entete">
        <div>
          <h2 className="dmd-titre">Mes tâches assignées</h2>
          <p className="dmd-note">
            Seul ce qui vous est assigné compte. Le temps est calculé automatiquement (durée standard de chaque tâche,
            répartie sur sa fenêtre), hors absences ; il n’est pas modifiable.
          </p>
        </div>
        <div className="vue-toggle" role="group" aria-label="Filtrer les tâches">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? 'is-active' : ''}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label} · {tasks.filter(f.keep).length}
            </button>
          ))}
        </div>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <div className="admin-table-wrap">
        <table className="admin-table temps-table">
          <thead>
            <tr>
              <th>Projet</th>
              <th>Tâche</th>
              <th className="num">Durée std</th>
              <th>Période</th>
              <th>Échéance</th>
              <th className="num">Temps prévu · imputé</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="me-vide">
                  Rien dans cette liste.
                </td>
              </tr>
            )}
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="rh-matricule">
                  <Link className="lien-inline" href={projectHref(base, t.projetId)}>
                    {t.projetCode}
                  </Link>
                </td>
                <td data-label="Tâche">
                  {t.libelle}
                  <span className="cell-sub">
                    {t.projetClient} · {t.etape}
                  </span>
                  {/* Motif sous la tâche : dans la colonne Statut, il poussait « Remettre » hors de l'écran. */}
                  {t.renvoiMotif && <span className="cell-sub temps-alerte">« {t.renvoiMotif} »</span>}
                </td>
                <td data-label="Durée std" className="num">
                  {t.dureeStandard == null ? '—' : formatHours(t.dureeStandard)}
                </td>
                <td data-label="Période">
                  {t.debut && t.echeance ? `du ${formatDayMonth(t.debut)} au ${formatDayMonth(t.echeance)}` : '—'}
                  {t.manque && t.statut !== 'validee' && (
                    <span className="cell-sub temps-alerte">{LIBELLE_MANQUE[t.manque]}</span>
                  )}
                </td>
                <td data-label="Échéance">{t.echeance ? formatDate(t.echeance) : '—'}</td>
                <td data-label="Prévu · imputé" className="num">
                  {t.dureeStandard == null ? '—' : `${formatHours(t.dureeStandard)} · ${formatHours(t.heuresImputees)}`}
                </td>
                <td data-label="Statut">
                  <span className="perf-statut">
                    <Pill className={TASK_STATUS_LABELS[t.statut].pill}>{statusLabel(t, today)}</Pill>
                    {t.statut !== 'validee' && t.statut !== 'remise' && (
                      <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onSubmit(t)}>
                        Déposer
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
