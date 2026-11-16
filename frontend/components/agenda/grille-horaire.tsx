'use client';

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { Repeat } from 'lucide-react';
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
import { creneauDe, deplacer, instants, memeCreneau, redimensionner, type Creneau } from '@/lib/agenda-glisser';

// Couleur d'un élément : celle du collègue dont l'agenda est superposé.
export const styleCalque = (e: ElementAgenda) =>
  e.calque ? { ['--ton' as string]: `var(--${e.calque.couleur})` } : undefined;
export const titreAffiche = (e: ElementAgenda) =>
  e.calque && e.type !== 'rendez_vous' ? `${e.calque.nom} · ${e.titre}` : e.titre;

// Glisser commencé : rien ne bouge avant 4 px (un simple clic ouvre la fiche).
const SEUIL_PX = 4;
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
// À l'ouverture : la journée de travail en vue (7 h 30), ou l'heure actuelle.
const DEFILEMENT_MIN = 7 * 60 + 30;

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
  onCreneau,
  onOuvrir,
  onJour,
  onDeplacer,
}: {
  jours: string[];
  aujourdhui: string;
  elements: ElementAgenda[];
  peutCreer: boolean;
  onCreneau: (jour: string, debut: string, fin: string) => void;
  onOuvrir: (e: ElementAgenda) => void;
  onJour?: (jour: string) => void;
  onDeplacer?: (e: ElementAgenda, debut: string, fin: string) => void;
}) {
  const corps = useRef<HTMLDivElement>(null);
  const colonnes = useRef<(HTMLDivElement | null)[]>([]);
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  // Un glisser se termine par un « click » du navigateur : ne pas ouvrir la fiche.
  const vientDeGlisser = useRef(false);
  // Échap abandonne un glisser en cours.
  const enGlisse = !!glisse;
  useEffect(() => {
    if (!enGlisse) return;
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setGlisse(null);
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
  useEffect(() => {
    const cible = avecAujourdhui ? Math.max(0, maintenant - 90) : DEFILEMENT_MIN;
    if (corps.current) corps.current.scrollTop = px(cible);
    // Au changement de période seulement, pas à chaque minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jours.join(','), avecAujourdhui]);

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
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const { debut, fin } = creneauClique((y / HEURE_PX) * 60);
    onCreneau(jour, hhmmOfMinutes(debut), hhmmOfMinutes(Math.min(fin, MINUTES_JOUR - 1)));
  }

  // Seuls les rendez-vous qu'on peut modifier, tenant dans une journée.
  const glissable = (e: ElementAgenda) =>
    !!onDeplacer && e.modifiable && !!e.debut && !!e.fin && e.debut.slice(0, 10) === e.fin.slice(0, 10);

  function commencer(e: ElementAgenda, ev: PointerEvent<HTMLButtonElement>) {
    if (!glissable(e) || ev.button !== 0 || ev.pointerType === 'touch') return;
    vientDeGlisser.current = false;
    // Capture sur le corps de la grille, qui ne bouge jamais : le bloc, lui,
    // change de colonne (et d'élément) quand il passe à un autre jour.
    corps.current?.setPointerCapture?.(ev.pointerId);
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
    if (!glisse) return;
    // Bouton relâché hors de la page : on abandonne.
    if (ev.buttons === 0) {
      setGlisse(null);
      return;
    }
    const dx = ev.clientX - glisse.x;
    const dy = ev.clientY - glisse.y;
    if (!glisse.bouge && Math.hypot(dx, dy) < SEUIL_PX) return;
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
    if (!glisse) return;
    if (glisse.bouge) {
      vientDeGlisser.current = true;
      const avant = instants(glisse.origine);
      const apres = instants(glisse.apercu);
      if (avant.debut !== apres.debut || avant.fin !== apres.fin) onDeplacer?.(glisse.e, apres.debut, apres.fin);
    }
    setGlisse(null);
  }

  function ouvrir(e: ElementAgenda) {
    if (vientDeGlisser.current) {
      vientDeGlisser.current = false;
      return;
    }
    onOuvrir(e);
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
                  className={`agenda-puce agenda-puce--${TONS[e.type]}${e.maReponse === 'non' && !e.calque ? ' is-decline' : ''}`}
                  style={styleCalque(e)}
                  onClick={() => onOuvrir(e)}
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
        onPointerMove={glisse ? suivre : undefined}
        onPointerUp={glisse ? terminer : undefined}
        onPointerCancel={glisse ? () => setGlisse(null) : undefined}
      >
        <div className="agenda-grille-heures" aria-hidden>
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: px(h * 60) }}>
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          ))}
        </div>
        {jours.map((j, i) => (
          <div
            key={j}
            ref={(el) => {
              colonnes.current[i] = el;
            }}
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
                className={[
                  'agenda-bloc',
                  `agenda-puce--${TONS[p.e.type]}`,
                  glissable(p.e) && 'is-glissable',
                  glisse?.bouge && glisse.e.id === p.e.id && 'is-glisse',
                  // Déclinée : visible, mais effacée (comme Google Agenda).
                  p.e.maReponse === 'non' && !p.e.calque && 'is-decline',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  ...styleCalque(p.e),
                  top: px(p.debut),
                  height: px(p.fin - p.debut) - 2,
                  left: `calc(${(p.colonne / p.colonnes) * 100}% + 2px)`,
                  width: `calc(${100 / p.colonnes}% - 4px)`,
                }}
                onClick={() => ouvrir(p.e)}
                onPointerDown={(ev) => commencer(p.e, ev)}
                aria-label={`${p.e.calque ? `${p.e.calque.nom} : ` : ''}${p.e.titre}${p.e.maReponse === 'non' && !p.e.calque ? ' (déclinée)' : ''}${p.e.serieId ? ' (répétée)' : ''}, ${formatWeekdayDayMonth(j)}, ${formatTime(p.e.debut!)} – ${formatTime(p.e.fin!)}`}
              >
                <strong>
                  {p.e.serieId && <Repeat size={11} aria-hidden className="agenda-bloc-repete" />}
                  {p.e.titre}
                </strong>
                <span>
                  {formatTime(p.e.debut!)} – {formatTime(p.e.fin!)}
                  {p.e.lieu ? ` · ${p.e.lieu}` : ''}
                </span>
                {glissable(p.e) && <span className="agenda-bloc-poignee" aria-hidden />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
