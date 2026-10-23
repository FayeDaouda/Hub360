'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react';

// Actions secondaires repliées derrière un bouton « Plus d'actions » — pour
// un en-tête qui en aligne trop sur téléphone. Motif « bouton qui déplie une
// liste » (aria-expanded) : Échap, clic à l'extérieur ou choix d'une action
// le referment, et le focus revient au bouton.

export type ActionMenu = {
  cle: string;
  libelle: string;
  icone?: LucideIcon;
  onClick: () => void;
  desactive?: boolean;
};

export function MenuActions({
  actions,
  libelle = 'Plus d’actions',
  className,
}: {
  actions: ActionMenu[];
  libelle?: string;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  if (!actions.length) return null;

  return (
    <div ref={racine} className={`menu-actions${className ? ` ${className}` : ''}`}>
      <button
        ref={bouton}
        type="button"
        className="btn-ghost menu-actions-bouton"
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={() => setOuvert((o) => !o)}
      >
        <MoreHorizontal size={15} aria-hidden /> {libelle}
        <ChevronDown size={14} aria-hidden className={`menu-actions-chevron${ouvert ? ' est-ouvert' : ''}`} />
      </button>
      {ouvert && (
        <ul id={id} className="menu-actions-liste">
          {actions.map((a) => {
            const Icone = a.icone;
            return (
              <li key={a.cle}>
                <button
                  type="button"
                  disabled={a.desactive}
                  onClick={() => {
                    setOuvert(false);
                    a.onClick();
                  }}
                >
                  {Icone && <Icone size={16} aria-hidden />}
                  {a.libelle}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
