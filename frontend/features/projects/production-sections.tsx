import { Pill } from '@/components/ui/pill';
import { formatDayMonth } from '@hub/domain';
import { loadTone, upcomingDeadlines } from './production-labels';
import type { ProductionView } from './types';

// Charge des cellules sur deux semaines : heures prévues sur la présence de
// chacun (absences et fériés retirés), comparées à la zone normale.
export function CellsLoad({ load }: { load: ProductionView['charge'] }) {
  return (
    <section className="panel glass-panel prod-section" aria-label="Charge des cellules">
      {/* Le découpage du texte (« au », espace, date en nœuds séparés) est
          celui d'origine : recollé, Chrome espace « au 09/11 » autrement et le
          rendu change de quelques pixels. Prettier le recollerait. */}
      {/* prettier-ignore */}
      <h2 className="dmd-titre">
        Charge des cellules · du {formatDayMonth(load.periode.debut)} au{' '}
        {formatDayMonth(load.periode.fin)}
      </h2>
      <p className="dmd-note">
        Heures prévues des tâches à faire, sur la présence de chacun (absences et fériés retirés), comparées à la zone
        normale
        {load.zone ? ` de ${load.zone.de} à ${load.zone.a} %` : ''}.
      </p>
      <div className="prod-cellules">
        {load.cellules.map((cell) => (
          <div key={cell.code} className="prod-cellule">
            <div className="prod-cellule-tete">
              <strong>{cell.nom}</strong>
              <Pill className={`pill--${loadTone(cell.moyenne, load.zone)}`}>
                {cell.moyenne === null ? '—' : `${cell.moyenne} %`}
              </Pill>
            </div>
            {cell.membres.map((m) => (
              <div key={m.id} className="prod-membre" data-ton={loadTone(m.pourcentage, load.zone)}>
                <span className="prod-membre-nom">{m.nom}</span>
                <span className="prod-barre prod-barre--charge" aria-hidden>
                  <span style={{ width: `${Math.min(100, m.pourcentage ?? 0)}%` }} />
                </span>
                <span className="prod-membre-pct">
                  {m.pourcentage === null ? 'absent' : `${m.pourcentage} %`}
                  {m.joursAbsence > 0 && m.pourcentage !== null ? ` · ${m.joursAbsence} j abs.` : ''}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// À venir · 14 jours : livraisons et fins de cartes clés, chacune ouvre son projet.
export function UpcomingDeadlines({ view, onOpen }: { view: ProductionView; onOpen: (projectId: string) => void }) {
  const deadlines = upcomingDeadlines(view);
  return (
    <section className="panel glass-panel prod-section" aria-label="À venir">
      <h2 className="dmd-titre">À venir · 14 jours</h2>
      {deadlines.length === 0 ? (
        <p className="dmd-note">Aucune livraison ni fin de carte clé dans les 14 jours.</p>
      ) : (
        <ul className="prod-echeances">
          {deadlines.map((e) => (
            <li key={e.cle}>
              <button type="button" className="prod-echeance" onClick={() => onOpen(e.projetId)}>
                <span className="prod-echeance-date">{formatDayMonth(e.le)}</span>
                <span>{e.texte}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
