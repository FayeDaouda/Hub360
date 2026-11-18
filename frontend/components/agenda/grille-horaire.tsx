'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { Repeat, Video } from 'lucide-react';
import {
  addDays,
  formatTime,
  formatWeekdayDayMonth,
  formatWeekdayShort,
  hhmmOfMinutes,
  minutesOfDay,
} from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import type { Rect } from '@/lib/agenda-placement';
import { creneauClique, MINUTES_JOUR, placerJour } from '@/lib/agenda-grille';
import { creneauDe, deplacer, instants, memeCreneau, redimensionner, type Creneau } from '@/lib/agenda-glisser';

// Couleur d'un élément : celle du collègue dont l'agenda est superposé ;
// pour un rendez-vous importé, celle de son agenda d'origine (« #rrggbb »).
export const styleCalque = (e: ElementAgenda) =>
  e.calque
    ? { ['--ton' as string]: `var(--${e.calque.couleur})` }
    : e.couleur && /^#[0-9a-f]{6}$/i.test(e.couleur)
      ? { ['--ton' as string]: e.couleur }
      : undefined;
export const titreAffiche = (e: ElementAgenda) =>
  e.calque && e.type !== 'rendez_vous' ? `${e.calque.nom} · ${e.titre}` : e.titre;

// Glisser commencé : rien ne bouge avant 4 px (un simple clic ouvre la fiche).
const SEUIL_PX = 4;
// Créneau tracé à la souris dans une colonne vide (18/11/2026).
type Trace = { jour: string; colonne: number; depart: number; actuel: number; y: number; bouge: boolean };
const QUART = 15;
const rect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom });

type Glisse = {
  e: ElementAgenda;
  mode: 'deplacer' | 'redimensionner';
  x: number;
  y: number;
  origine: Creneau;
  apercu: Creneau;
  bouge: boolean;
};

// Hauteur d'une heure dans la grille, en pixels (le CSS la reprend).
const HEURE_PX = 48;
const px = (minutes: number) => (minutes / 60) * HEURE_PX;
// À l'ouverture (18/11/2026) : la journée de travail (7 h), ou plus tôt si un
// rendez-vous commence avant ; une demi-heure de marge au-dessus.
const DEBUT_JOURNEE_MIN = 7 * 60;
const MARGE_MIN = 30;
// Un rendez-vous de moins de 50 minutes tient sur une ligne : « Titre, 15:30 ».
const COURT_MIN = 50;
// Chevauchements (comme Google Agenda) : chaque rendez-vous déborde sur la
// colonne suivante, celui qui commence après passe devant.
const DEBORD = 1.7;

// Où se place un rendez-vous parmi ceux qu'il chevauche, en % de la colonne.
export function largeurBloc(colonne: number, colonnes: number): { gauche: number; largeur: number } {
  const part = 100 / colonnes;
  const gauche = colonne * part;
  const largeur = colonne === colonnes - 1 ? part : Math.min(100 - gauche, part * DEBORD);
  return { gauche, largeur };
}

// Le premier défilement : 7 h (ou le premier rendez-vous, s'il est plus tôt),
// moins une demi-heure ; aujourd'hui affiché et l'heure actuelle hors de vue :
// elle, au tiers de la hauteur.
export function defilementInitial(premier: number | null, maintenant: number | null, visibles: number): number {
  let cible = Math.min(DEBUT_JOURNEE_MIN, premier ?? DEBUT_JOURNEE_MIN) - MARGE_MIN;
  if (maintenant !== null && (maintenant < cible || maintenant > cible + visibles * 0.8)) {
    cible = maintenant - visibles / 3;
  }
  return Math.max(0, cible);
}

const minutesDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const estWeekEnd = (jour: string) => [0, 6].includes(new Date(`${jour}T12:00:00Z`).getUTCDay());

export const TONS: Record<ElementAgenda['type'], 'info' | 'attention' | 'neutre' | 'risque' | 'validation'> = {
  rendez_vous: 'info',
  echeance: 'attention',
  conge: 'neutre',
  demande: 'risque',
  // Rendez-vous personnels importés de Google ou d'Apple (16/11/2026).
  externe: 'validation',
};

// Vues Jour et Semaine en grille horaire (12/11/2026), façon Google Agenda :
// une colonne par jour, une ligne par heure, les rendez-vous placés à leur
// heure (côte à côte s'ils se chevauchent), la ligne de l'heure actuelle ;
// échéances, absences et demandes dans le bandeau « Journée ». Cliquer un
// créneau vide le propose à la création ; cliquer un élément l'ouvre.
// Glisser-déplacer (12/11/2026, souris ou stylet) : son rendez-vous se
// déplace (d'un jour à l'autre en Semaine) ou s'allonge par le bas, au quart
// d'heure ; au clavier et au doigt, « Modifier » dans sa fiche.
export function GrilleHoraire({
  jours,
  aujourdhui,
  elements,
  peutCreer,
  brouillon = null,
  onCreneau,
  onOuvrir,
  onJour,
  onDeplacer,
}: {
  jours: string[];
  aujourdhui: string;
  elements: ElementAgenda[];
  peutCreer: boolean;
  // Le créneau en cours de création rapide (bloc fantôme).
  brouillon?: { jour: string; debut: string; fin: string } | null;
  // `ancre` : où poser la carte de création rapide (le créneau à l'écran).
  onCreneau: (jour: string, debut: string, fin: string, ancre?: Rect) => void;
  // `ancre` : où poser la fiche (le bloc cliqué).
  onOuvrir: (e: ElementAgenda, ancre?: Rect) => void;
  onJour?: (jour: string) => void;
  onDeplacer?: (e: ElementAgenda, debut: string, fin: string) => void;
}) {
  const corps = useRef<HTMLDivElement>(null);
  const colonnes = useRef<(HTMLDivElement | null)[]>([]);
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  // Un tracé se termine aussi par un « click » : ne pas créer une 2e fois.
  const vientDeTracer = useRef(false);
  // Un glisser se termine par un « click » du navigateur : ne pas ouvrir la fiche.
  const vientDeGlisser = useRef(false);
  // Échap abandonne un glisser ou un tracé en cours.
  const enGlisse = !!glisse || !!trace;
  useEffect(() => {
    if (!enGlisse) return;
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setGlisse(null);
        setTrace(null);
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [enGlisse]);
  const [maintenant, setMaintenant] = useState(() => minutesOfDay(new Date().toISOString()));
  useEffect(() => {
    const t = setInterval(() => setMaintenant(minutesOfDay(new Date().toISOString())), 60_000);
    return () => clearInterval(t);
  }, []);
  const avecAujourdhui = jours.includes(aujourdhui);

  // La grille occupe la hauteur de l'écran, jusqu'à la navigation du bas sur
  // téléphone : jamais de vide dessous, jamais de double défilement.
  useLayoutEffect(() => {
    const el = corps.current;
    if (!el) return;
    const ajuster = () => {
      const haut = el.getBoundingClientRect().top + window.scrollY;
      const navBas = [...document.querySelectorAll('nav')]
        .filter((n) => getComputedStyle(n).position === 'fixed')
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top > window.innerHeight / 2)
        .reduce((min, r) => Math.min(min, r.top), window.innerHeight);
      el.style.height = `${Math.max(320, Math.round(navBas - haut - 16))}px`;
    };
    ajuster();
    // Ce qui pousse la grille (demandes à décider, mini-calendrier) la
    // réajuste aussi ; sans ResizeObserver, le redimensionnement suffit.
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ajuster);
    obs?.observe(document.body);
    window.addEventListener('resize', ajuster);
    return () => {
      obs?.disconnect();
      window.removeEventListener('resize', ajuster);
    };
  }, []);

  // Premier défilement de la période : une fois ses rendez-vous connus.
  const cleJours = jours.join(',');
  const premierHoraire = elements
    .filter((e) => e.debut && e.fin && jours.includes(e.jour) && e.debut.slice(0, 10) === e.jour)
    .reduce<number | null>((min, e) => Math.min(min ?? Infinity, minutesOfDay(e.debut!)), null);
  // Des rendez-vous de ces jours-là (pas ceux de la période d'avant, encore
  // affichés le temps de la lecture).
  const charges = elements.some((e) => jours.includes(e.jour));
  const defile = useRef<string | null>(null);
  useEffect(() => {
    const el = corps.current;
    if (!el) return;
    const cle = `${cleJours}|${charges}`;
    if (defile.current === cle || (defile.current?.startsWith(`${cleJours}|true`) ?? false)) return;
    defile.current = cle;
    const visibles = (el.clientHeight / HEURE_PX) * 60;
    el.scrollTop = px(defilementInitial(premierHoraire, avecAujourdhui ? maintenant : null, visibles));
    // Au changement de période (et à l'arrivée de ses rendez-vous) seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleJours, charges]);

  // Pendant un glisser : le rendez-vous s'affiche à sa place d'arrivée.
  const affiches = elements.map((e) => {
    if (!glisse?.bouge || e.id !== glisse.e.id) return e;
    const { debut, fin } = instants(glisse.apercu);
    return { ...e, jour: glisse.apercu.jour, debut, fin };
  });
  const journee = (j: string) => affiches.filter((e) => e.jour === j && !(e.debut && e.fin));
  // Un rendez-vous apparaît chaque jour qu'il touche (une réunion qui passe
  // minuit se voit aussi le lendemain).
  const horaires = (j: string) => {
    const debutJour = `${j}T00:00:00.000Z`;
    const finJour = `${addDays(j, 1)}T00:00:00.000Z`;
    return affiches.filter((e) => e.debut && e.fin && e.debut < finJour && e.fin > debutJour);
  };
  const avecJournee = jours.some((j) => journee(j).length > 0);

  function cliquer(jour: string, ev: MouseEvent<HTMLDivElement>) {
    if (!peutCreer || ev.target !== ev.currentTarget) return;
    if (vientDeTracer.current) {
      vientDeTracer.current = false;
      return;
    }
    const r = ev.currentTarget.getBoundingClientRect();
    const { debut, fin } = creneauClique(((ev.clientY - r.top) / HEURE_PX) * 60);
    const finBornee = Math.min(fin, MINUTES_JOUR - 1);
    onCreneau(jour, hhmmOfMinutes(debut), hhmmOfMinutes(finBornee), {
      top: r.top + px(debut),
      bottom: r.top + px(finBornee),
      left: r.left,
      right: r.right,
    });
  }

  // Tracer un créneau (souris, stylet) : de la case pressée à celle relâchée,
  // au quart d'heure. Au doigt, le défilement garde la main.
  const minuteSous = (colonne: number, clientY: number) => {
    const r = colonnes.current[colonne]?.getBoundingClientRect();
    const m = r ? ((clientY - r.top) / HEURE_PX) * 60 : 0;
    return Math.max(0, Math.min(MINUTES_JOUR - QUART, Math.floor(m / QUART) * QUART));
  };
  function commencerTrace(jour: string, colonne: number, ev: PointerEvent<HTMLDivElement>) {
    if (!peutCreer || ev.target !== ev.currentTarget || ev.button !== 0 || ev.pointerType === 'touch') return;
    vientDeTracer.current = false;
    // Pas de capture tout de suite : un simple clic reste un clic sur la case.
    const m = minuteSous(colonne, ev.clientY);
    setTrace({ jour, colonne, depart: m, actuel: m, y: ev.clientY, bouge: false });
  }
  const bornesTrace = (t: Trace) => ({
    debut: Math.min(t.depart, t.actuel),
    fin: Math.min(Math.max(t.depart, t.actuel) + QUART, MINUTES_JOUR - 1),
  });

  // Seuls les rendez-vous qu'on peut modifier, tenant dans une journée.
  const glissable = (e: ElementAgenda) =>
    !!onDeplacer && e.modifiable && !!e.debut && !!e.fin && e.debut.slice(0, 10) === e.fin.slice(0, 10);

  function commencer(e: ElementAgenda, ev: PointerEvent<HTMLButtonElement>) {
    if (!glissable(e) || ev.button !== 0 || ev.pointerType === 'touch') return;
    vientDeGlisser.current = false;
    // Pas de capture à l'appui : un simple clic doit rester un clic sur le
    // bloc (il ouvre la fiche). Elle vient au premier mouvement (voir suivre).
    const origine = creneauDe(e.debut!, e.fin!);
    const poignee = (ev.target as HTMLElement).classList.contains('agenda-bloc-poignee');
    setGlisse({
      e,
      mode: poignee ? 'redimensionner' : 'deplacer',
      x: ev.clientX,
      y: ev.clientY,
      origine,
      apercu: origine,
      bouge: false,
    });
  }

  function suivre(ev: PointerEvent<HTMLDivElement>) {
    if (trace) {
      if (ev.buttons === 0) return setTrace(null);
      const bouge = trace.bouge || Math.abs(ev.clientY - trace.y) >= SEUIL_PX;
      // Le tracé commence : le pointeur est suivi même hors de la grille.
      if (bouge && !trace.bouge) corps.current?.setPointerCapture?.(ev.pointerId);
      const actuel = minuteSous(trace.colonne, ev.clientY);
      if (bouge !== trace.bouge || actuel !== trace.actuel) setTrace({ ...trace, actuel, bouge });
      return;
    }
    if (!glisse) return;
    // Bouton relâché hors de la page : on abandonne.
    if (ev.buttons === 0) {
      setGlisse(null);
      return;
    }
    const dx = ev.clientX - glisse.x;
    const dy = ev.clientY - glisse.y;
    if (!glisse.bouge && Math.hypot(dx, dy) < SEUIL_PX) return;
    // Le glisser commence : capture sur le corps de la grille, qui ne bouge
    // jamais (le bloc, lui, change de colonne en passant à un autre jour).
    if (!glisse.bouge) corps.current?.setPointerCapture?.(ev.pointerId);
    const delta = (dy / HEURE_PX) * 60;
    let apercu: Creneau;
    if (glisse.mode === 'redimensionner') apercu = redimensionner(glisse.origine, delta);
    else {
      // Le jour sous le pointeur (Semaine) ; sinon le jour d'origine.
      const i = colonnes.current.findIndex((c) => {
        const r = c?.getBoundingClientRect();
        return !!r && ev.clientX >= r.left && ev.clientX < r.right;
      });
      apercu = deplacer(glisse.origine, delta, i >= 0 ? jours[i] : glisse.origine.jour);
    }
    // Rien ne change tant que le quart d'heure reste le même.
    if (glisse.bouge && memeCreneau(apercu, glisse.apercu)) return;
    setGlisse({ ...glisse, apercu, bouge: true });
  }

  function terminer() {
    if (trace) {
      if (trace.bouge) {
        vientDeTracer.current = true;
        const { debut, fin } = bornesTrace(trace);
        const r = colonnes.current[trace.colonne]?.getBoundingClientRect();
        onCreneau(
          trace.jour,
          hhmmOfMinutes(debut),
          hhmmOfMinutes(fin),
          r && { top: r.top + px(debut), bottom: r.top + px(fin), left: r.left, right: r.right },
        );
      }
      setTrace(null);
      return;
    }
    if (!glisse) return;
    if (glisse.bouge) {
      vientDeGlisser.current = true;
      const avant = instants(glisse.origine);
      const apres = instants(glisse.apercu);
      if (avant.debut !== apres.debut || avant.fin !== apres.fin) onDeplacer?.(glisse.e, apres.debut, apres.fin);
    }
    setGlisse(null);
  }

  function ouvrir(e: ElementAgenda, ev: MouseEvent<HTMLElement>) {
    if (vientDeGlisser.current) {
      vientDeGlisser.current = false;
      return;
    }
    onOuvrir(e, rect(ev.currentTarget.getBoundingClientRect()));
  }
  // Le bloc fantôme : le créneau tracé, ou celui de la création rapide.
  const fantome = trace?.bouge
    ? { jour: trace.jour, ...bornesTrace(trace) }
    : brouillon
      ? { jour: brouillon.jour, debut: minutesDe(brouillon.debut), fin: minutesDe(brouillon.fin) }
      : null;

  return (
    <div className="agenda-grille" style={{ ['--jours' as string]: jours.length }}>
      <div className="agenda-grille-tete">
        <span aria-hidden />
        {jours.map((j) => (
          <button
            key={j}
            type="button"
            className={[
              'agenda-grille-jour',
              j === aujourdhui && 'is-aujourdhui',
              j < aujourdhui && 'is-passe',
              estWeekEnd(j) && 'is-weekend',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onJour?.(j)}
            disabled={!onJour}
            aria-current={j === aujourdhui ? 'date' : undefined}
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
                  className={`agenda-puce agenda-puce--${TONS[e.type]}${e.maReponse === 'non' && !e.calque ? ' is-decline' : ''}`}
                  style={styleCalque(e)}
                  onClick={(ev) => onOuvrir(e, rect(ev.currentTarget.getBoundingClientRect()))}
                  title={titreAffiche(e)}
                >
                  {titreAffiche(e)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div
        className="agenda-grille-corps"
        ref={corps}
        onPointerMove={glisse || trace ? suivre : undefined}
        onPointerUp={glisse || trace ? terminer : undefined}
        onPointerCancel={
          glisse || trace
            ? () => {
                setGlisse(null);
                setTrace(null);
              }
            : undefined
        }
      >
        <div className="agenda-grille-heures" aria-hidden>
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              style={{ top: px(h * 60) }}
              // L'heure actuelle la remplace quand elles se touchent.
              className={avecAujourdhui && Math.abs(h * 60 - maintenant) < 14 ? 'is-masquee' : undefined}
            >
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          ))}
          {avecAujourdhui && (
            <span className="agenda-grille-heure-actuelle" style={{ top: px(maintenant) }}>
              {hhmmOfMinutes(maintenant)}
            </span>
          )}
        </div>
        {jours.map((j, i) => (
          <div
            key={j}
            ref={(el) => {
              colonnes.current[i] = el;
            }}
            className={[
              'agenda-grille-colonne',
              peutCreer && 'is-cliquable',
              estWeekEnd(j) && 'is-weekend',
              j === aujourdhui && 'is-aujourdhui',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(ev) => cliquer(j, ev)}
            onPointerDown={(ev) => commencerTrace(j, i, ev)}
          >
            {fantome && fantome.jour === j && (
              <span
                className="agenda-bloc agenda-bloc--fantome"
                style={{ top: px(fantome.debut) + 1, height: Math.max(px(fantome.fin - fantome.debut) - 2, 18) }}
                aria-hidden
              >
                <span className="agenda-bloc-titre">
                  <strong>(Sans titre)</strong>
                </span>
                <span className="agenda-bloc-heures">
                  {hhmmOfMinutes(fantome.debut)} – {hhmmOfMinutes(fantome.fin)}
                </span>
              </span>
            )}
            {avecAujourdhui && (
              <span
                className={`agenda-grille-maintenant${j === aujourdhui ? '' : ' is-autre-jour'}`}
                style={{ top: px(maintenant) }}
                aria-hidden
              />
            )}
            {placerJour(horaires(j), j).map((p) => {
              const { gauche, largeur } = largeurBloc(p.colonne, p.colonnes);
              const duree = p.fin - p.debut;
              const decline = p.e.maReponse === 'non' && !p.e.calque;
              const heures = `${formatTime(p.e.debut!)} – ${formatTime(p.e.fin!)}`;
              return (
                <button
                  key={p.e.id}
                  type="button"
                  className={[
                    'agenda-bloc',
                    `agenda-puce--${TONS[p.e.type]}`,
                    duree < COURT_MIN && 'is-court',
                    duree >= 75 && 'is-long',
                    duree >= 55 && 'is-heure',
                    p.e.fin! < new Date().toISOString() && 'is-passe',
                    p.e.calque && 'is-calque',
                    glissable(p.e) && 'is-glissable',
                    glisse?.bouge && glisse.e.id === p.e.id && 'is-glisse',
                    // Déclinée : visible, mais en contour (comme Google Agenda).
                    decline && 'is-decline',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    ...styleCalque(p.e),
                    top: px(p.debut) + 1,
                    height: px(duree) - 2,
                    left: `calc(${gauche}% + 1px)`,
                    width: `calc(${largeur}% - 4px)`,
                    zIndex: 1 + p.colonne,
                  }}
                  onClick={(ev) => ouvrir(p.e, ev)}
                  onPointerDown={(ev) => commencer(p.e, ev)}
                  aria-label={`${p.e.calque ? `${p.e.calque.nom} : ` : ''}${p.e.titre}${decline ? ' (déclinée)' : ''}${p.e.serieId ? ' (répétée)' : ''}, ${formatWeekdayDayMonth(j)}, ${heures}${p.e.lieu ? `, ${p.e.lieu}` : ''}`}
                >
                  <span className="agenda-bloc-titre">
                    {p.e.serieId && <Repeat size={11} aria-hidden className="agenda-bloc-icone" />}
                    {p.e.lienVisio && <Video size={12} aria-hidden className="agenda-bloc-icone" />}
                    <strong>{titreAffiche(p.e)}</strong>
                    {duree < COURT_MIN && <span className="agenda-bloc-heure-courte">, {formatTime(p.e.debut!)}</span>}
                  </span>
                  {duree >= COURT_MIN && <span className="agenda-bloc-heures">{heures}</span>}
                  {/* Le lieu, s'il reste une ligne (1 h 15 et plus). */}
                  {duree >= 75 && p.e.lieu && <span className="agenda-bloc-lieu">{p.e.lieu}</span>}
                  {glissable(p.e) && <span className="agenda-bloc-poignee" aria-hidden />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
