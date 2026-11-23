'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export type ElementMenu = {
  cle: string;
  libelle: string;
  icone?: ReactNode;
  // Raccourci clavier affiché à droite (« S »).
  raccourci?: string;
  // Choix exclusif (vue) : coché ou non ; absent : simple action.
  coche?: boolean;
  onChoisir: () => void;
};

// Menu déroulant (18/11/2026) : un bouton, une liste d'actions ou de choix.
// Clavier comme un menu natif : flèches, Début/Fin, Entrée, Échap (le focus
// revient au bouton) ; un clic dehors le ferme.
export function Menu({
  declencheur,
  libelle,
  elements,
  className,
  alignement = 'droite',
}: {
  declencheur: ReactNode; // contenu du bouton
  libelle: string; // nom accessible du bouton et du menu
  elements: ElementMenu[];
  className?: string; // classes du bouton
  alignement?: 'droite' | 'gauche';
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    // pointerdown : un toucher à côté (téléphone) le ferme aussi.
    document.addEventListener('pointerdown', dehors);
    // Le choix coché (sinon le premier) reçoit le focus à l'ouverture.
    const items = [...(liste.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    (items.find((x) => x.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    return () => document.removeEventListener('pointerdown', dehors);
  }, [ouvert]);

  function fermer() {
    setOuvert(false);
    bouton.current?.focus();
  }

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(liste.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const aller = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') aller(i + 1);
    else if (e.key === 'ArrowUp') aller(i - 1);
    else if (e.key === 'Home') aller(0);
    else if (e.key === 'End') aller(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    } else if (e.key === 'Tab') setOuvert(false);
  }

  return (
    <div className="menu" ref={boite}>
      <button
        ref={bouton}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        aria-label={libelle}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !ouvert) {
            e.preventDefault();
            setOuvert(true);
          }
        }}
      >
        {declencheur}
      </button>
      {ouvert && (
        <div
          ref={liste}
          id={id}
          role="menu"
          aria-label={libelle}
          className={`menu-liste menu-liste--${alignement}`}
          onKeyDown={clavier}
        >
          {elements.map((x) => (
            <button
              key={x.cle}
              type="button"
              role={x.coche === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={x.coche}
              tabIndex={-1}
              className={`menu-element${x.coche ? ' is-coche' : ''}`}
              onClick={() => {
                fermer();
                x.onChoisir();
              }}
            >
              <span className="menu-element-icone" aria-hidden>
                {x.coche === undefined ? x.icone : x.coche ? <Check size={15} /> : null}
              </span>
              <span className="menu-element-libelle">{x.libelle}</span>
              {x.raccourci && (
                <kbd className="menu-element-raccourci" aria-hidden>
                  {x.raccourci}
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
