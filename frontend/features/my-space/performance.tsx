'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleCheck, Clock, ListChecks, RotateCcw } from 'lucide-react';
import { formatHours, formatMonthYear, plural, todayIso } from '@hub/domain';
import { sectionAccessible } from '@/lib/acces-back-office';
import { ApiError } from '@/lib/client-api';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getMonTemps } from '@/lib/temps';
import type { MonTemps } from '@/lib/types';
import { getMyTasks } from '@/features/my-tasks/api';
import { SubmissionModal } from '@/features/my-tasks/submission-modal';
import type { MyTask, MyTasksView } from '@/features/my-tasks/types';
import { KpiStrip } from '@/components/ui/kpi';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { AssignedTasksTable } from './assigned-tasks-table';
import { MonthlyTable } from './monthly-table';
import { ValidatedHistory } from './validated-history';

// « Mon espace » · Mes performances — un BILAN (revue Salarié 19/10/2026) :
// respect des délais, taux de reprise, mois par mois, historique des tâches
// validées. On agit dans « Mes tâches » ; les rôles sans cette page gardent
// ici la liste des tâches assignées et leur remise au N+1. Les règles (à
// temps, reprise) sont calculées par le back.
export function MyPerformance({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = pathname.split('/mon-espace')[0];
  const today = useMemo(() => todayIso(), []);
  const [data, setData] = useState<MyTasksView | null>(null);
  const [time, setTime] = useState<MonTemps | null>(null);
  const [toSubmit, setToSubmit] = useState<MyTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoursByMonth, setHoursByMonth] = useState<Record<string, MonTemps['feuille']>>({});
  const hasMyTasks = sectionAccessible(useSessionCourante(), 'mes-taches');

  const load = useCallback(() => {
    getMyTasks(slug)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Impossible de charger vos tâches.'));
    getMonTemps(slug)
      .then(setTime)
      .catch(() => setTime(null));
  }, [slug]);
  useEffect(load, [load]);
  // Heures de chaque mois suivi (feuilles de temps) pour le bilan mensuel.
  const periods = time?.periodes.join(',');
  useEffect(() => {
    if (!periods) return;
    Promise.all(periods.split(',').map((m) => getMonTemps(slug, m).then((r) => [m, r.feuille] as const)))
      .then((l) => setHoursByMonth(Object.fromEntries(l)))
      .catch(() => setHoursByMonth({}));
  }, [slug, periods]);

  if (!data) {
    return error ? (
      <EmptyState>{error}</EmptyState>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }
  const { taches: tasks, stats } = data;
  const onTime = stats.respectDelais;
  const rework = stats.reprises;
  const validated = tasks.filter((t) => t.statut === 'validee');
  const months = [...(time?.periodes ?? [])].reverse();
  const history = [...validated].sort((a, b) => (b.valideLe ?? '').localeCompare(a.valideLe ?? ''));

  return (
    <>
      <KpiStrip
        tiles={[
          {
            id: 'delais',
            label: 'Respect des délais',
            value: onTime.pct == null ? '—' : `${onTime.pct} %`,
            // Seules les tâches validées APRÈS une remise datée sont jugées.
            hint: onTime.total
              ? `${plural(onTime.aTemps, 'remise')} à temps sur ${plural(onTime.total, 'jugée')}`
              : stats.validees
                ? `${plural(stats.validees, 'tâche')} validée${stats.validees > 1 ? 's' : ''}, aucune remise datée à juger`
                : 'aucune tâche validée pour l’instant',
            icon: CircleCheck,
          },
          {
            id: 'reprises',
            label: 'Taux de reprise',
            value: rework.pct == null ? '—' : `${rework.pct} %`,
            hint: rework.total
              ? `${plural(rework.avecReprise, 'tâche')} renvoyée${rework.avecReprise > 1 ? 's' : ''} au moins une fois sur ${rework.total}`
              : 'aucune remise validée pour l’instant',
            icon: RotateCcw,
          },
          {
            id: 'validees',
            label: 'Tâches validées',
            value: stats.validees,
            hint: `${stats.enCours} encore en cours`,
            icon: ListChecks,
          },
          {
            id: 'temps',
            label: time ? `Temps imputé · ${formatMonthYear(time.feuille.mois)}` : 'Temps imputé',
            value: time ? formatHours(time.feuille.heuresImputees) : '—',
            hint: `${time?.feuille.occupation ?? 0} % d’occupation · calcul automatique`,
            icon: Clock,
          },
        ]}
      />

      <MonthlyTable months={months} validated={validated} hoursByMonth={hoursByMonth} />
      <ValidatedHistory tasks={history} base={base} />

      {hasMyTasks ? (
        <p className="dmd-note me-pied">
          Vos tâches en cours, à déposer ou à reprendre :{' '}
          <Link className="lien-inline" href={`${base}/mes-taches`}>
            Mes tâches
          </Link>
          .
        </p>
      ) : (
        <AssignedTasksTable tasks={tasks} base={base} today={today} error={error} onSubmit={setToSubmit} />
      )}

      {toSubmit && (
        <SubmissionModal slug={slug} task={toSubmit} onSubmitted={setData} onClose={() => setToSubmit(null)} />
      )}
    </>
  );
}
