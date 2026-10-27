'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarX, Clock, Gauge } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { getMonTemps, HEURES_PAR_JOUR, STATUT_FEUILLE } from '@/lib/temps';
import type { MonTemps } from '@/lib/types';
import { KpiStrip } from '@/components/ui/kpi';
import { LignesCalcul } from '@/components/rh/lignes-calcul';
import { formatDate, formatHours, formatMonthYear } from '@hub/domain';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';
import { MonthCalendar } from './month-calendar';
import { TimeGapReport } from './time-gap-report';

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Impossible de charger votre temps.');

// « Mon espace » · Mon temps (RH lot 4, maquette du boss) : la feuille du
// mois, calculée automatiquement à partir des tâches assignées (durée
// standard répartie sur les jours ouvrés de la fenêtre), hors absences
// validées. Lecture seule ; la RH contrôle chaque mois. Pas de confirmation
// (revue Salarié 19/10/2026) : sans écart signalé, la feuille est juste.
export function MyTime({ slug }: { slug: string }) {
  const [data, setData] = useState<MonTemps | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMonTemps(slug, month)
      .then(setData)
      .catch((e) => setError(message(e)));
  }, [slug, month]);
  useEffect(load, [load]);

  if (!data) {
    return error ? (
      <EmptyState>{error}</EmptyState>
    ) : (
      <div className="admin-skeleton" aria-hidden>
        <Skeleton />
      </div>
    );
  }
  const { feuille: sheet } = data;
  const control =
    sheet.statut === 'controlee' && sheet.controleLe
      ? `contrôlée le ${formatDate(sheet.controleLe)}`
      : STATUT_FEUILLE[sheet.statut].libelle.toLowerCase();

  return (
    <>
      <div className="admin-periode temps-mois">
        <div className="admin-periode-toggle" role="group" aria-label="Mois">
          {data.periodes.map((m) => (
            <button
              key={m}
              type="button"
              className={m === data.mois ? 'is-active' : ''}
              aria-pressed={m === data.mois}
              onClick={() => {
                setError(null);
                setMonth(m);
              }}
            >
              {formatMonthYear(m)}
            </button>
          ))}
        </div>
        <span className="me-pastille">Contrôle RH : {control}</span>
      </div>
      {error && <FieldError>{error}</FieldError>}

      <KpiStrip
        tiles={[
          {
            id: 'imputees',
            label: 'Heures imputées',
            value: formatHours(sheet.heuresImputees),
            hint: `${sheet.lignes.length} assignation(s)`,
            icon: Clock,
          },
          {
            id: 'disponibles',
            label: 'Heures disponibles',
            value: formatHours(sheet.heuresDisponibles),
            hint: `jours ouvrés écoulés × ${HEURES_PAR_JOUR} h`,
            icon: CalendarClock,
          },
          {
            id: 'absences',
            label: 'Absences',
            value: `${sheet.joursAbsence} j`,
            hint: 'congés et absences validés',
            icon: CalendarX,
          },
          {
            id: 'occupation',
            label: 'Taux d’occupation',
            value: `${sheet.occupation ?? 0} %`,
            hint: 'imputé / disponible',
            icon: Gauge,
          },
        ]}
      />

      {sheet.calendrier && <MonthCalendar days={sheet.calendrier} />}

      <section className="panel glass-panel dmd-section temps-panel">
        <h2 className="dmd-titre">Détail du calcul · {formatMonthYear(sheet.mois)}</h2>
        <LignesCalcul lignes={sheet.lignes} variante="salarie" />
        <p className="dmd-note">
          Calcul automatique : durée standard de chaque tâche assignée, répartie sur les jours ouvrés de sa fenêtre,
          hors absences validées. Vous ne saisissez rien ; la RH contrôle la feuille chaque mois.
        </p>
      </section>

      {data.signalable && <TimeGapReport slug={slug} data={data} onChange={setData} />}
    </>
  );
}
