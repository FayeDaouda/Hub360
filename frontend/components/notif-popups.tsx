'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AtSign, Bell, BellRing, ChevronRight, Gavel, UsersRound, X } from 'lucide-react';
import { estDecision } from '@/lib/notifications';
import type { ResumeAbsence } from '@/lib/use-notifications-poll';
import type { NotificationItem } from '@/lib/types';

// Pop-ups des notifications (01/11/2026) : cartes empilées en haut à droite
// (pleine largeur sur téléphone), teintées selon le sens — décision à
// prendre, mention, information. Chacune se retire après 8 s, en pause tant
// que la souris ou le clavier est dessus ; « Ouvrir » mène à la page (ou à la
// conversation) et marque la notification lue.
const DUREE_MS = 8_000;

type Genre = 'decision' | 'mention' | 'groupe' | 'info';
const genreDe = (n: NotificationItem): Genre =>
  n.type === 'mention_chat' ? 'mention' : n.type === 'groupe_chat' ? 'groupe' : estDecision(n) ? 'decision' : 'info';
const GENRES: Record<Genre, { libelle: string; Icone: typeof Bell }> = {
  decision: { libelle: 'Décision à prendre', Icone: Gavel },
  mention: { libelle: 'On vous a mentionné', Icone: AtSign },
  groupe: { libelle: 'Messagerie', Icone: UsersRound },
  info: { libelle: 'Notification', Icone: Bell },
};

export function NotifPopups({
  popups,
  resume,
  onOuvrir,
  onFermer,
  onFermerResume,
  onToutVoir,
}: {
  popups: NotificationItem[];
  resume: ResumeAbsence | null;
  onOuvrir: (n: NotificationItem) => void;
  onFermer: (id: string) => void;
  onFermerResume: () => void;
  onToutVoir: () => void;
}) {
  if (typeof document === 'undefined' || (!popups.length && !resume)) return null;
  return createPortal(
    <div className="npop-hote" aria-live="polite">
      {resume && <Resume resume={resume} onOuvrir={onOuvrir} onFermer={onFermerResume} onToutVoir={onToutVoir} />}
      {popups.map((n) => (
        <Popup key={n.id} n={n} onOuvrir={() => onOuvrir(n)} onFermer={() => onFermer(n.id)} />
      ))}
    </div>,
    document.body,
  );
}

// Temps restant, en pause au survol ou au focus ; à zéro, la carte sort.
function useMinuterie(onFin: () => void) {
  const [pause, setPause] = useState(false);
  const [reste, setReste] = useState(DUREE_MS);
  const fin = useRef(onFin);
  useEffect(() => {
    fin.current = onFin;
  }, [onFin]);
  useEffect(() => {
    if (pause) return;
    const debut = Date.now();
    const depart = reste;
    const id = setInterval(() => {
      const r = depart - (Date.now() - debut);
      setReste(Math.max(0, r));
      if (r <= 0) {
        clearInterval(id);
        fin.current();
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);
  const handlers = {
    onMouseEnter: () => setPause(true),
    onMouseLeave: () => setPause(false),
    onFocus: () => setPause(true),
    onBlur: () => setPause(false),
  };
  return { progression: reste / DUREE_MS, handlers };
}

function Popup({ n, onOuvrir, onFermer }: { n: NotificationItem; onOuvrir: () => void; onFermer: () => void }) {
  const genre = genreDe(n);
  const { libelle, Icone } = GENRES[genre];
  const { progression, handlers } = useMinuterie(onFermer);
  return (
    <section className={`npop npop--${genre}`} role="status" aria-label={libelle} {...handlers}>
      <span className="npop-icone" aria-hidden>
        <Icone size={18} />
      </span>
      <div className="npop-corps">
        <span className="npop-genre">
          {libelle} <span className="npop-quand">· à l’instant</span>
        </span>
        <p className="npop-titre">{n.titre}</p>
        <div className="npop-actions">
          <button type="button" className="npop-ouvrir" onClick={onOuvrir}>
            Ouvrir <ChevronRight size={15} aria-hidden />
          </button>
          <button type="button" className="npop-plus-tard" onClick={onFermer}>
            Plus tard
          </button>
        </div>
      </div>
      <button type="button" className="npop-fermer" aria-label="Fermer" onClick={onFermer}>
        <X size={16} aria-hidden />
      </button>
      <span className="npop-temps" style={{ transform: `scaleX(${progression})` }} aria-hidden />
    </section>
  );
}

// Au retour d'une absence, plus de trois notifications : un résumé.
function Resume({
  resume,
  onOuvrir,
  onFermer,
  onToutVoir,
}: {
  resume: ResumeAbsence;
  onOuvrir: (n: NotificationItem) => void;
  onFermer: () => void;
  onToutVoir: () => void;
}) {
  const { progression, handlers } = useMinuterie(onFermer);
  return (
    <section className="npop npop--resume" role="status" aria-label="Pendant votre absence" {...handlers}>
      <span className="npop-icone" aria-hidden>
        <BellRing size={18} />
      </span>
      <div className="npop-corps">
        <span className="npop-genre">Pendant votre absence</span>
        <p className="npop-titre">{resume.total} nouvelles notifications</p>
        <ul className="npop-liste">
          {resume.elements.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onOuvrir(n)}>
                {n.titre}
              </button>
            </li>
          ))}
        </ul>
        <div className="npop-actions">
          <button
            type="button"
            className="npop-ouvrir"
            onClick={() => {
              onToutVoir();
              onFermer();
            }}
          >
            Tout voir <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      </div>
      <button type="button" className="npop-fermer" aria-label="Fermer" onClick={onFermer}>
        <X size={16} aria-hidden />
      </button>
      <span className="npop-temps" style={{ transform: `scaleX(${progression})` }} aria-hidden />
    </section>
  );
}
