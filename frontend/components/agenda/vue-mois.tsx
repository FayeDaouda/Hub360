'use client';

import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Repeat, Video } from 'lucide-react';
import { addDays, capitalize, formatTime, formatWeekdayDayMonth } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { placerSemaine, semainesDuMois, type Segment } from '@/lib/agenda-mois';
import { rectDe as rect, type Rect } from '@/lib/agenda-placement';
import { elementsDuJour } from './vue-mois-jour';
import { FenetreAncree } from './fenetre-ancree';
import {
  basUtilisable,
  estDeclinee as decline,
  InitialesCalque,
  styleCalque,
  titreAffiche,
  TONS,
} from './grille-horaire';

const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
// Hauteurs (le CSS les reprend) : le numéro du jour, une ligne d'élément.
const NUMERO_PX = 28;
const LIGNE_PX = 22;
// Le 1er d'un mois porte le nom du mois (« 1 déc. »), comme Google Agenda.
const MOIS_COURT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const passe = (e: ElementAgenda) => !!e.fin && e.fin < new Date().toISOString();

// Libellé lu d'un élément : à qui (collègue), quoi, quand.
function libelle(e: ElementAgenda, s?: Segment): string {
  const qui = e.calque ? `${e.calque.nom} : ` : '';
  const quand = e.debut
    ? `, ${formatTime(e.debut)}`
    : s && s.span > 1
      ? `, du ${formatWeekdayDayMonth(e.jour)} pendant ${s.span} jours`
      : ', toute la journée';
  // Une barre qui vient de la semaine d'avant ou continue après : dit-le.
  const suite = s?.suiteAvant
    ? s.suiteApres
      ? ' (commencé avant, continue après cette semaine)'
      : ' (commencé la semaine précédente)'
    : s?.suiteApres
      ? ' (continue la semaine suivante)'
      : '';
  return `${qui}${e.titre}${decline(e) ? ' (déclinée)' : ''}${quand}${suite}`;
}

// Mois façon Google Agenda (U4, 23/11/2026) : 5 ou 6 semaines à la hauteur de
// l'écran ; un rendez-vous avec heure = un point de sa couleur, l'heure et le
// titre ; une journée entière = une barre pleine, d'un seul tenant sur
// plusieurs jours ; ce qui ne tient pas = « + n autres » (la journée en
// fenêtre). Le numéro ouvre la vue Jour ; un clic dans le vide d'une case
// y propose un rendez-vous. Téléphone : des points seulement, un jour touché
// ouvre sa journée.
export function VueMois({
  du,
  mois,
  aujourdhui,
  elements,
  etroit,
  peutCreer,
  onJour,
  onOuvrir,
  onCreer,
}: {
  du: string; // lundi de la première semaine
  mois: string; // AAAA-MM
  aujourdhui: string;
  elements: ElementAgenda[];
  etroit: boolean;
  peutCreer: boolean;
  onJour: (jour: string) => void;
  onOuvrir: (e: ElementAgenda, ancre?: Rect) => void;
  onCreer: (jour: string, ancre: Rect) => void;
}) {
  const nbSemaines = semainesDuMois(du, mois);
  const boite = useRef<HTMLDivElement>(null);
  // Lignes d'éléments qui tiennent dans une case (mesuré).
  const [lignes, setLignes] = useState(3);
  // « + n autres » ouvert : la journée et où poser la fenêtre.
  const [journee, setJournee] = useState<{ jour: string; ancre: Rect } | null>(null);

  // Toute la hauteur de l'écran ; les lignes suivent la taille des cases.
  // Comme la grille horaire : ce qui la pousse (demandes à décider, message
  // d'erreur) la réajuste aussi, à l'image suivante (jamais de boucle
  // d'observation) ; la hauteur n'est écrite que si elle change.
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el || etroit) return;
    const ajuster = () => {
      const h = Math.max(480, Math.round(basUtilisable(el) - (el.getBoundingClientRect().top + window.scrollY)));
      if (el.style.height !== `${h}px`) el.style.height = `${h}px`;
      const semaine = el.querySelector<HTMLElement>('.agenda-mois-semaine');
      const hs = semaine?.getBoundingClientRect().height ?? 0;
      if (hs > 0) setLignes(Math.max(1, Math.floor((hs - NUMERO_PX - 4) / LIGNE_PX)));
    };
    ajuster();
    let image = 0;
    const plusTard = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(ajuster);
    };
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(plusTard);
    obs?.observe(document.body);
    obs?.observe(el.closest('.agenda-disposition') ?? el);
    window.addEventListener('resize', plusTard);
    return () => {
      cancelAnimationFrame(image);
      obs?.disconnect();
      window.removeEventListener('resize', plusTard);
      // Passé sur téléphone sans être remonté : plus de hauteur figée.
      el.style.removeProperty('height');
    };
  }, [etroit, nbSemaines]);

  const ouvrir = (e: ElementAgenda, ev: MouseEvent<HTMLElement>) => {
    ev.stopPropagation();
    onOuvrir(e, rect(ev.currentTarget.getBoundingClientRect()));
  };

  return (
    <div className={`agenda-mois${etroit ? ' agenda-mois--points' : ''}`} ref={boite}>
      <div className="agenda-mois-entetes" aria-hidden>
        {JOURS.map((j, i) => (
          <span key={j} className={i > 4 ? 'is-weekend' : undefined}>
            {j}
          </span>
        ))}
      </div>
      <div className="agenda-mois-semaines" style={{ gridTemplateRows: `repeat(${nbSemaines}, minmax(0, 1fr))` }}>
        {Array.from({ length: nbSemaines }, (_, s) => {
          const lundi = addDays(du, s * 7);
          const jours = Array.from({ length: 7 }, (_, k) => addDays(lundi, k));
          const { segments, plus } = etroit ? { segments: [], plus: [] } : placerSemaine(elements, lundi, lignes);
          return (
            <div
              key={lundi}
              className="agenda-mois-semaine"
              // Téléphone : le numéro (et ses points) occupe toute la case.
              style={{
                gridTemplateRows: etroit ? '1fr' : `${NUMERO_PX}px repeat(${Math.max(1, lignes)}, ${LIGNE_PX}px) 1fr`,
              }}
            >
              {jours.map((j, k) => {
                const classes = [
                  'agenda-mois-case',
                  j.slice(0, 7) !== mois && 'is-hors-mois',
                  k > 4 && 'is-weekend',
                  j === aujourdhui && 'is-aujourdhui',
                  peutCreer && !etroit && 'is-creable',
                ].filter(Boolean);
                return (
                  // Le fond de la case : un clic dans le vide propose un
                  // rendez-vous (souris ; au clavier, le bouton « Créer »).
                  <div
                    key={j}
                    className={classes.join(' ')}
                    style={{ gridColumn: k + 1 }}
                    onClick={
                      peutCreer && !etroit
                        ? (ev) => onCreer(j, rect(ev.currentTarget.getBoundingClientRect()))
                        : undefined
                    }
                  />
                );
              })}
              {jours.map((j, k) => {
                const n = elementsDuJour(elements, j).length;
                return (
                  <button
                    key={j}
                    type="button"
                    className={`agenda-mois-numero${j === aujourdhui ? ' is-aujourdhui' : ''}${j.slice(0, 7) !== mois ? ' is-hors-mois' : ''}`}
                    style={{ gridColumn: k + 1 }}
                    onClick={() => onJour(j)}
                    aria-label={`${capitalize(formatWeekdayDayMonth(j))}${n ? ` · ${n} élément${n > 1 ? 's' : ''}` : ''} : afficher la journée`}
                    aria-current={j === aujourdhui ? 'date' : undefined}
                  >
                    {j.endsWith('-01') ? `1 ${MOIS_COURT.format(new Date(`${j}T12:00:00Z`))}` : Number(j.slice(8))}
                    {etroit && n > 0 && (
                      <span className="agenda-mois-points" aria-hidden>
                        {elementsDuJour(elements, j)
                          .slice(0, 3)
                          .map((e) => (
                            <span key={e.id} className={`agenda-puce--${TONS[e.type]}`} style={styleCalque(e)} />
                          ))}
                      </span>
                    )}
                  </button>
                );
              })}
              {!etroit &&
                segments.map((sg) => (
                  <button
                    key={`${sg.e.id}|${sg.col}`}
                    type="button"
                    className={[
                      'agenda-mois-el',
                      `agenda-puce--${TONS[sg.e.type]}`,
                      sg.e.debut ? 'is-heure' : 'is-journee',
                      sg.suiteAvant && 'is-suite-avant',
                      sg.suiteApres && 'is-suite-apres',
                      passe(sg.e) && 'is-passe',
                      decline(sg.e) && 'is-decline',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      ...styleCalque(sg.e),
                      gridColumn: `${sg.col + 1} / span ${sg.span}`,
                      gridRow: sg.ligne + 2,
                    }}
                    onClick={(ev) => ouvrir(sg.e, ev)}
                    aria-label={libelle(sg.e, sg)}
                    title={titreAffiche(sg.e)}
                  >
                    {sg.e.debut && <span className="agenda-mois-point" aria-hidden />}
                    <InitialesCalque e={sg.e} />
                    {sg.e.debut && <span className="agenda-mois-heure">{formatTime(sg.e.debut)}</span>}
                    {sg.e.serieId && <Repeat size={11} aria-hidden className="agenda-mois-icone" />}
                    {sg.e.lienVisio && <Video size={12} aria-hidden className="agenda-mois-icone" />}
                    <span className="agenda-mois-titre">{titreAffiche(sg.e)}</span>
                  </button>
                ))}
              {!etroit &&
                plus.map((p) => (
                  <button
                    key={`plus|${p.jour}`}
                    type="button"
                    className="agenda-mois-plus"
                    style={{ gridColumn: p.col + 1, gridRow: Math.max(1, lignes) + 1 }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setJournee({ jour: p.jour, ancre: rect(ev.currentTarget.getBoundingClientRect()) });
                    }}
                    aria-label={`${p.n} autre${p.n > 1 ? 's' : ''} le ${formatWeekdayDayMonth(p.jour)}`}
                  >
                    + {p.n} autre{p.n > 1 ? 's' : ''}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {journee && (
        <FenetreAncree
          ancre={journee.ancre}
          etroit={etroit}
          onClose={() => setJournee(null)}
          labelledBy="agenda-mois-journee-titre"
          className="agenda-mois-journee"
        >
          <h3 id="agenda-mois-journee-titre">
            <button
              type="button"
              className="agenda-mois-journee-jour"
              onClick={() => {
                setJournee(null);
                onJour(journee.jour);
              }}
            >
              {capitalize(formatWeekdayDayMonth(journee.jour))}
            </button>
          </h3>
          <ul>
            {elementsDuJour(elements, journee.jour).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={[
                    'agenda-mois-el',
                    `agenda-puce--${TONS[e.type]}`,
                    e.debut ? 'is-heure' : 'is-journee',
                    passe(e) && 'is-passe',
                    decline(e) && 'is-decline',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={styleCalque(e)}
                  onClick={() => {
                    const ancre = journee.ancre;
                    setJournee(null);
                    onOuvrir(e, ancre);
                  }}
                  aria-label={libelle(e)}
                >
                  {e.debut && <span className="agenda-mois-point" aria-hidden />}
                  <InitialesCalque e={e} />
                  {e.debut && <span className="agenda-mois-heure">{formatTime(e.debut)}</span>}
                  <span className="agenda-mois-titre">{titreAffiche(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        </FenetreAncree>
      )}
    </div>
  );
}
