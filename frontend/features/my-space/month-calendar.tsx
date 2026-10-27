import type { CSSProperties } from 'react';
import { formatDate, formatHours, todayIso } from '@hub/domain';
import { HEURES_PAR_JOUR } from '@/lib/temps';
import type { JourCalendrierTemps } from '@/lib/types';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_KIND: Record<JourCalendrierTemps['nature'], string> = {
  travail: 'Travaillé',
  absence: 'Absence',
  ferie: 'Férié',
  weekend: 'Week-end',
  hors: 'À venir',
};

// Le mois en grille (19/10/2026) : la feuille se lit d'un coup d'œil, un
// écart (absence oubliée, jour vide) se repère tout seul. Intensité de la
// case = heures du jour sur 8 h.
export function MonthCalendar({ days }: { days: JourCalendrierTemps[] }) {
  const today = todayIso();
  // Cases vides avant le 1er (semaine du lundi).
  const offset = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Mon mois jour par jour</h2>
      <div className="tc-grille" role="table" aria-label="Heures par jour">
        {WEEKDAYS.map((d) => (
          <span key={d} className="tc-entete" role="columnheader">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`v${i}`} className="tc-jour tc-jour--vide" aria-hidden />
        ))}
        {days.map((d) => (
          <span
            key={d.date}
            role="cell"
            className={`tc-jour tc-jour--${d.nature}${d.date === today ? ' is-aujourdhui' : ''}`}
            style={
              d.nature === 'travail'
                ? ({ '--tc-charge': Math.min(1, d.heures / HEURES_PAR_JOUR) } as CSSProperties)
                : undefined
            }
            title={`${formatDate(d.date)} · ${DAY_KIND[d.nature]}${d.heures ? ` · ${formatHours(d.heures)}` : ''}`}
          >
            <span className="tc-numero">{Number(d.date.slice(8, 10))}</span>
            <span className="tc-valeur">
              {d.nature === 'travail'
                ? d.heures
                  ? formatHours(d.heures)
                  : '0 h'
                : d.nature === 'absence' || d.nature === 'ferie'
                  ? DAY_KIND[d.nature]
                  : ''}
            </span>
          </span>
        ))}
      </div>
      <p className="tc-legende">
        <span className="tc-puce tc-puce--travail" /> heures imputées (plus foncé = plus chargé)
        <span className="tc-puce tc-puce--absence" /> absence validée
        <span className="tc-puce tc-puce--ferie" /> jour férié
        <span className="tc-puce tc-puce--hors" /> à venir
      </p>
    </section>
  );
}
