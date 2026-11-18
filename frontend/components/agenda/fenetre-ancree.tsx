'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { placerFenetre, type Rect } from '@/lib/agenda-placement';
import { Dialog } from '@/components/ui/dialog';

// Fenêtre ancrée de l'Agenda (18/11/2026) : la fiche d'un rendez-vous, la
// création rapide. Ordinateur : une carte posée à côté de ce qu'on a cliqué
// (comme Google Agenda), sans voile ; téléphone : une feuille qui monte du
// bas ; sans ancre : centrée. Le focus y entre à l'ouverture et revient où il
// était à la fermeture ; Échap et un clic dehors la ferment.
export function FenetreAncree({
  ancre,
  etroit,
  onClose,
  busy = false,
  labelledBy,
  className,
  children,
}: {
  ancre: Rect | null;
  etroit: boolean;
  onClose: () => void;
  busy?: boolean;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const mode = etroit ? 'feuille' : ancre ? 'carte' : 'centre';

  // Carte : mesurée, puis placée à côté de l'ancre (invisible jusque-là).
  useLayoutEffect(() => {
    const el = boite.current;
    if (mode !== 'carte' || !ancre || !el) return;
    const placer = () => {
      const r = el.getBoundingClientRect();
      const { top, left } = placerFenetre(
        ancre,
        { largeur: r.width, hauteur: r.height },
        { largeur: window.innerWidth, hauteur: window.innerHeight },
      );
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.classList.add('is-placee');
    };
    placer();
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(placer);
    obs?.observe(el);
    window.addEventListener('resize', placer);
    return () => {
      obs?.disconnect();
      window.removeEventListener('resize', placer);
    };
  }, [mode, ancre]);

  // Le focus entre dans la fenêtre, puis revient à ce qui l'a ouverte.
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    const el = boite.current;
    if (el) {
      el.tabIndex = -1;
      // Un champ marqué autoFocus garde la main (création rapide).
      if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }
    return () => avant?.focus?.({ preventScroll: true });
  }, []);

  return (
    <Dialog
      onClose={onClose}
      busy={busy}
      portal
      labelledBy={labelledBy}
      trapFocus
      backdropClassName={`agenda-ancre-fond agenda-ancre-fond--${mode}`}
      className={['agenda-ancre', `agenda-ancre--${mode}`, className].filter(Boolean).join(' ')}
      boxRef={boite}
    >
      {etroit && <span className="agenda-ancre-poignee" aria-hidden />}
      {children}
    </Dialog>
  );
}
