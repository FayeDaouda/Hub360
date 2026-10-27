import { formatHours, formatMonthYear } from '@hub/domain';
import type { MyTask } from '@/features/my-tasks/types';
import type { MonTemps } from '@/lib/types';
import { percent } from './percent';

// « Mois par mois » : tâches validées, remises à temps (jugées par le back),
// reprises, heures et occupation des feuilles de temps.
export function MonthlyTable({
  months,
  validated,
  hoursByMonth,
}: {
  months: string[];
  validated: MyTask[];
  hoursByMonth: Record<string, MonTemps['feuille']>;
}) {
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Mois par mois</h2>
      <div className="admin-table-wrap">
        <table className="admin-table bilan-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th className="num">Validées</th>
              <th>Remises à temps</th>
              <th className="num">Reprises</th>
              <th className="num">Heures imputées</th>
              <th className="num">Occupation</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const ofMonth = validated.filter((t) => t.valideLe?.startsWith(m));
              const judged = ofMonth.filter((t) => t.aTemps !== null);
              const p = percent(judged.filter((t) => t.aTemps).length, judged.length);
              const sheet = hoursByMonth[m];
              return (
                <tr key={m}>
                  <td className="bilan-mois">{formatMonthYear(m)}</td>
                  <td data-label="Validées" className="num">
                    {ofMonth.length}
                  </td>
                  <td data-label="Remises à temps">
                    {p == null ? (
                      <span className="cell-sub">—</span>
                    ) : (
                      <span className="bilan-barre" title={`${p} %`}>
                        <span style={{ width: `${p}%` }} />
                        <em>{p} %</em>
                      </span>
                    )}
                  </td>
                  <td data-label="Reprises" className="num">
                    {ofMonth.filter((t) => t.version > 1).length}
                  </td>
                  <td data-label="Heures imputées" className="num">
                    {sheet ? formatHours(sheet.heuresImputees) : '…'}
                  </td>
                  <td data-label="Occupation" className="num">
                    {sheet?.occupation == null ? '—' : `${sheet.occupation} %`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
