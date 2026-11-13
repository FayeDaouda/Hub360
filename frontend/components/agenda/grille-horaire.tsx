'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  addDays,
  formatTime,
  formatWeekdayDayMonth,
  formatWeekdayShort,
  hhmmOfMinutes,
  minutesOfDay,
} from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { creneauClique, MINUTES_JOUR, placerJour } from '@/lib/agenda-grille';

// Hauteur d'une heure dans la grille, en pixels (le CSS la reprend).
const HEURE_PX = 48;
const px = (minutes: number) => (minutes / 60) * HEURE_PX;
// À l'ouverture : la journée de travail en vue (7 h 30), ou l'heure actuelle.
const DEFILEMENT_MIN = 7 * 60 + 30;

export const TONS: Record<ElementAgenda['type'], 'info' | 'attention' | 'neutre' | 'risque'> = {
  rendez_vous: 'info',
  echeance: 'attention',
  conge: 'neutre',
  demande: 'risque',
};

// Vues Jour et Semaine en grille horaire (12/11/2026), façon Google Agenda :
// une colonne par jour, une ligne par heure, les rendez-vous placés à leur
// heure (côte à côte s'ils se chevauchent), la ligne de l'heure actuelle ;
// échéances, absences et demandes dans le bandeau « Journée ». Cliquer un
// créneau vide le propose à la création ; cliquer un élément l'ouvre.
export function GrilleHoraire({
  jours,
  aujourdhui,
  elements,
  peutCreer,
  onCreneau,
  onOuvrir,
  onJour,
}: {
  jours: string[];
  aujourdhui: string;
  elements: ElementAgenda[];
  peutCreer: boolean;
  onCreneau: (jour: string, debut: string, fin: string) => void;
  onOuvrir: (e: ElementAgenda) => void;
  onJour?: (jour: string) => void;
}) {
  const corps = useRef<HTMLDivElement>(null);
  const [maintenant, setMaintenant] = useState(() => minutesOfDay(new Date().toISOString()));
  useEffect(() => {
    const t = setInterval(() => setMaintenant(minutesOfDay(new Date().toISOString())), 60_000);
    return () => clearInterval(t);
  }, []);
  const avecAujourdhui = jours.includes(aujourdhui);
  useEffect(() => {
    const cible = avecAujourdhui ? Math.max(0, maintenant - 90) : DEFILEMENT_MIN;
    if (corps.current) corps.current.scrollTop = px(cible);
    // Au changement de période seulement, pas à chaque minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jours.join(','), avecAujourdhui]);

  const journee = (j: string) => elements.filter((e) => e.jour === j && !(e.debut && e.fin));
  // Un rendez-vous apparaît chaque jour qu'il touche (une réunion qui passe
  // minuit se voit aussi le lendemain).
  const horaires = (j: string) => {
    const debutJour = `${j}T00:00:00.000Z`;
    const finJour = `${addDays(j, 1)}T00:00:00.000Z`;
    return elements.filter((e) => e.debut && e.fin && e.debut < finJour && e.fin > debutJour);
  };
  const avecJournee = jours.some((j) => journee(j).length > 0);

  function cliquer(jour: string, ev: MouseEvent<HTMLDivElement>) {
    if (!peutCreer || ev.target !== ev.currentTarget) return;
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const { debut, fin } = creneauClique((y / HEURE_PX) * 60);
    onCreneau(jour, hhmmOfMinutes(debut), hhmmOfMinutes(Math.min(fin, MINUTES_JOUR - 1)));
  }

  return (
    <div className="agenda-grille" style={{ ['--jours' as string]: jours.length }}>
      <div className="agenda-grille-tete">
        <span aria-hidden />
        {jours.map((j) => (
          <button
            key={j}
            type="button"
            className={`agenda-grille-jour${j === aujourdhui ? ' is-aujourdhui' : ''}`}
            onClick={() => onJour?.(j)}
            disabled={!onJour}
          >
            <span>{formatWeekdayShort(j)}</span>
            <strong>{Number(j.slice(8))}</strong>
          </button>
        ))}
      </div>

      {avecJournee && (
        <div className="agenda-grille-journee">
          <span className="agenda-grille-libelle">Journée</span>
          {jours.map((j) => (
            <div key={j} className="agenda-grille-cellule">
              {journee(j).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`agenda-puce agenda-puce--${TONS[e.type]}`}
                  onClick={() => onOuvrir(e)}
                  title={e.titre}
                >
                  {e.titre}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="agenda-grille-corps" ref={corps}>
        <div className="agenda-grille-heures" aria-hidden>
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: px(h * 60) }}>
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          ))}
        </div>
        {jours.map((j) => (
          <div
            key={j}
            className={`agenda-grille-colonne${peutCreer ? ' is-cliquable' : ''}`}
            onClick={(ev) => cliquer(j, ev)}
          >
            {j === aujourdhui && (
              <span className="agenda-grille-maintenant" style={{ top: px(maintenant) }} aria-hidden />
            )}
            {placerJour(horaires(j), j).map((p) => (
              <button
                key={p.e.id}
                type="button"
                className={`agenda-bloc agenda-puce--${TONS[p.e.type]}`}
                style={{
                  top: px(p.debut),
                  height: px(p.fin - p.debut) - 2,
                  left: `calc(${(p.colonne / p.colonnes) * 100}% + 2px)`,
                  width: `calc(${100 / p.colonnes}% - 4px)`,
                }}
                onClick={() => onOuvrir(p.e)}
                aria-label={`${p.e.titre}, ${formatWeekdayDayMonth(j)}, ${formatTime(p.e.debut!)} – ${formatTime(p.e.fin!)}`}
              >
                <strong>{p.e.titre}</strong>
                <span>
                  {formatTime(p.e.debut!)} – {formatTime(p.e.fin!)}
                  {p.e.lieu ? ` · ${p.e.lieu}` : ''}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
