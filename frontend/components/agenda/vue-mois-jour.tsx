'use client';

import type { ReactNode } from 'react';
import { addDays, capitalize, formatWeekdayDayMonth } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { styleCalque, TONS } from './grille-horaire';

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Points sous un jour : trois au plus (un par élément, par ordre d'heure).
const POINTS_MAX = 3;

// Les éléments d'un jour, dans l'ordre : journée entière d'abord, puis par heure.
export function elementsDuJour(elements: ElementAgenda[], jour: string): ElementAgenda[] {
  return elements
    .filter((e) => e.jour === jour)
    .sort((a, b) => (a.debut ? 1 : 0) - (b.debut ? 1 : 0) || (a.debut ?? '').localeCompare(b.debut ?? ''));
}

// Téléphone (18/11/2026, maquette du user) : le mois en haut — un point de
// couleur sous chaque jour chargé —, et la journée choisie dessous, sur la
// grille des heures (23/11/2026, demande du user : comme la vue Jour, lignes
// des heures, « maintenant », un créneau touché crée un rendez-vous ; fournie
// par la page). On touche un jour pour le choisir ; on glisse pour changer de
// mois.
export function VueMoisJour({
  du,
  mois,
  jour,
  aujourdhui,
  elements,
  onJour,
  journee,
}: {
  du: string; // premier lundi de la grille de 6 semaines
  mois: string; // AAAA-MM affiché
  jour: string; // jour choisi
  aujourdhui: string;
  elements: ElementAgenda[];
  onJour: (jour: string) => void;
  journee: ReactNode; // la grille des heures du jour choisi
}) {
  const parJour = new Map<string, ElementAgenda[]>();
  for (const e of elements) parJour.set(e.jour, [...(parJour.get(e.jour) ?? []), e]);

  return (
    <div className="agenda-moisjour">
      <div className="agenda-moisjour-grille" aria-label="Choisir un jour" role="group">
        <div className="agenda-moisjour-entete">
          {JOURS_COURTS.map((j, i) => (
            <span key={i} aria-hidden className={i > 4 ? 'is-weekend' : undefined}>
              {j}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, s) => (
          <div key={s} className="agenda-moisjour-semaine">
            {Array.from({ length: 7 }, (_, k) => {
              const j = addDays(du, s * 7 + k);
              const charges = elementsDuJour(parJour.get(j) ?? [], j);
              return (
                <button
                  key={j}
                  type="button"
                  className={[
                    'agenda-moisjour-jour',
                    j.slice(0, 7) !== mois && 'is-hors-mois',
                    k > 4 && 'is-weekend',
                    j === aujourdhui && 'is-aujourdhui',
                    j === jour && 'is-choisi',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={j === jour}
                  aria-current={j === aujourdhui ? 'date' : undefined}
                  aria-label={`${formatWeekdayDayMonth(j)}${charges.length ? ` · ${charges.length} élément${charges.length > 1 ? 's' : ''}` : ''}`}
                  onClick={() => onJour(j)}
                >
                  <span className="agenda-moisjour-numero">{Number(j.slice(8))}</span>
                  <span className="agenda-moisjour-points" aria-hidden>
                    {charges.slice(0, POINTS_MAX).map((e) => (
                      <span key={e.id} className={`agenda-puce--${TONS[e.type]}`} style={styleCalque(e)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <section className="agenda-moisjour-liste" aria-labelledby="agenda-moisjour-titre">
        <h3 id="agenda-moisjour-titre" className="agenda-moisjour-jour-titre">
          {capitalize(formatWeekdayDayMonth(jour))}
          {jour === aujourdhui && <span className="agenda-moisjour-badge">Aujourd’hui</span>}
        </h3>
        {journee}
      </section>
    </div>
  );
}
