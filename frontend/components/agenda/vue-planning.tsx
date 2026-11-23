'use client';

import { CalendarPlus, Repeat, Video } from 'lucide-react';
import { formatTime, formatWeekdayDayMonth, formatWeekdayShort } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { rectDe as rect, type Rect } from '@/lib/agenda-placement';
import { elementsDuJour, sousTitre } from './vue-mois-jour';
import { estDeclinee, InitialesCalque, styleCalque, titreAffiche, TONS } from './grille-horaire';

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const date = (j: string) => new Date(`${j}T12:00:00Z`);

// Planning épuré (U4, 23/11/2026, façon Google Agenda) : les 30 jours à
// partir de `du`, les jours chargés seulement ; une ligne par élément — la
// date à gauche, l'heure, un point de couleur, le titre et le lieu ou les
// participants en gris. Aucune action dans la liste : une ligne ouvre sa
// fiche (modifier, annuler, répondre, décider).
export function VuePlanning({
  du,
  aujourdhui,
  elements,
  peutCreer,
  onOuvrir,
  onCreer,
}: {
  du: string;
  aujourdhui: string;
  elements: ElementAgenda[];
  peutCreer: boolean;
  onOuvrir: (e: ElementAgenda, ancre?: Rect) => void;
  onCreer: () => void;
}) {
  const jours = [...new Set(elements.map((e) => e.jour))].filter((j) => j >= du).sort();
  if (!jours.length)
    return (
      <div className="agenda-planning-vide">
        <p>Rien de prévu sur ces 30 jours.</p>
        {peutCreer && (
          <button type="button" className="btn-ghost" onClick={onCreer}>
            <CalendarPlus size={16} aria-hidden /> Créer un rendez-vous
          </button>
        )}
      </div>
    );
  const maintenant = new Date().toISOString();
  return (
    <div className="agenda-planning">
      {jours.map((j) => (
        // Un groupe par jour, titré pour la navigation par titres (lecteur d'écran).
        <section
          key={j}
          role="group"
          aria-labelledby={`agenda-planning-${j}`}
          className={`agenda-planning-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}
        >
          <h3 id={`agenda-planning-${j}`} className="sr-only">
            {formatWeekdayDayMonth(j)}
          </h3>
          <div className="agenda-planning-date" aria-hidden>
            <strong>{Number(j.slice(8))}</strong>
            <span>
              {MOIS.format(date(j))}, {formatWeekdayShort(j)}
            </span>
          </div>
          <ul>
            {elementsDuJour(elements, j).map((e) => {
              const sous = sousTitre(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={[
                      'agenda-planning-ligne',
                      `agenda-puce--${TONS[e.type]}`,
                      e.fin && e.fin < maintenant && 'is-passe',
                      estDeclinee(e) && 'is-decline',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={styleCalque(e)}
                    onClick={(ev) => onOuvrir(e, rect(ev.currentTarget.getBoundingClientRect()))}
                  >
                    <span className="agenda-planning-heure">
                      {e.debut && e.fin ? `${formatTime(e.debut)} – ${formatTime(e.fin)}` : 'Toute la journée'}
                    </span>
                    <span className="agenda-planning-point" aria-hidden />
                    <span className="agenda-planning-texte">
                      <strong>
                        <InitialesCalque e={e} />
                        {e.serieId && <Repeat size={12} aria-hidden />}
                        {e.lienVisio && <Video size={13} aria-hidden />}
                        {titreAffiche(e)}
                        {estDeclinee(e) && <span className="sr-only"> (déclinée)</span>}
                      </strong>
                      {sous && <span>{sous}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
