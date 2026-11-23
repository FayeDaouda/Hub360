'use client';

import { CalendarPlus, Repeat, Video } from 'lucide-react';
import { addDays, formatTime, formatWeekdayDayMonth } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import type { Rect } from '@/lib/agenda-placement';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { InitialesCalque, styleCalque, titreAffiche, TONS } from './grille-horaire';

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Points sous un jour : trois au plus (un par élément, par ordre d'heure).
const POINTS_MAX = 3;
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });

// Les éléments d'un jour, dans l'ordre : journée entière d'abord, puis par heure.
export function elementsDuJour(elements: ElementAgenda[], jour: string): ElementAgenda[] {
  return elements
    .filter((e) => e.jour === jour)
    .sort((a, b) => (a.debut ? 1 : 0) - (b.debut ? 1 : 0) || (a.debut ?? '').localeCompare(b.debut ?? ''));
}

// Ce qui s'affiche sous le titre d'une ligne : le lieu, sinon les invités,
// sinon le détail (échéance, absence) ; une demande d'absence, son type.
export function sousTitre(e: ElementAgenda): string | null {
  if (e.calque) return `Agenda de ${e.calque.nom}`;
  if (e.demande) return `${LIBELLE_TYPE_ABSENCE[e.demande.type]} · ${e.demande.jours} j · à décider`;
  if (e.lieu) return e.lieu;
  if (e.invites.length) return `Avec ${e.invites.join(', ')}`;
  return e.detail;
}

// Téléphone (18/11/2026, maquette du user) : le mois en haut — un point de
// couleur sous chaque jour chargé —, et la journée choisie en liste dessous :
// l'heure à gauche, une barre de la couleur du type, le titre et le lieu. On
// touche un jour pour le choisir ; on glisse pour changer de mois.
export function VueMoisJour({
  du,
  mois,
  jour,
  aujourdhui,
  elements,
  peutCreer,
  onJour,
  onOuvrir,
  onCreer,
}: {
  du: string; // premier lundi de la grille de 6 semaines
  mois: string; // AAAA-MM affiché
  jour: string; // jour choisi
  aujourdhui: string;
  elements: ElementAgenda[];
  peutCreer: boolean;
  onJour: (jour: string) => void;
  onOuvrir: (e: ElementAgenda, ancre?: Rect) => void;
  onCreer: (jour: string) => void;
}) {
  const parJour = new Map<string, ElementAgenda[]>();
  for (const e of elements) parJour.set(e.jour, [...(parJour.get(e.jour) ?? []), e]);
  const duJour = elementsDuJour(elements, jour);

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
          {capitale(formatWeekdayDayMonth(jour))}
          {jour === aujourdhui && <span className="agenda-moisjour-badge">Aujourd’hui</span>}
        </h3>
        {duJour.length === 0 ? (
          <div className="agenda-moisjour-vide">
            <p>Rien de prévu ce jour-là.</p>
            {peutCreer && (
              <button type="button" className="btn-ghost" onClick={() => onCreer(jour)}>
                <CalendarPlus size={16} aria-hidden /> Créer un rendez-vous
              </button>
            )}
          </div>
        ) : (
          <ul>
            {duJour.map((e) => {
              const sous = sousTitre(e);
              const decline = e.maReponse === 'non' && !e.calque;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`agenda-moisjour-ligne agenda-puce--${TONS[e.type]}${decline ? ' is-decline' : ''}`}
                    style={styleCalque(e)}
                    onClick={(ev) => onOuvrir(e, rect(ev.currentTarget.getBoundingClientRect()))}
                  >
                    <span className="agenda-moisjour-heures">
                      {e.debut && e.fin ? (
                        <>
                          <strong>{formatTime(e.debut)}</strong>
                          <span>{formatTime(e.fin)}</span>
                        </>
                      ) : (
                        <strong>Journée</strong>
                      )}
                    </span>
                    <span className="agenda-moisjour-barre" aria-hidden />
                    <span className="agenda-moisjour-texte">
                      <strong>
                        <InitialesCalque e={e} />
                        {e.serieId && <Repeat size={12} aria-hidden />}
                        {e.lienVisio && <Video size={13} aria-hidden />}
                        {titreAffiche(e)}
                      </strong>
                      {sous && <span>{sous}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
