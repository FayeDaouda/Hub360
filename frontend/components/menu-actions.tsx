'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react';

// Actions secondaires repliées derrière un bouton — « Plus d'actions » pour
// un en-tête qui en aligne trop sur téléphone, ou « ⋯ » seul au bout d'une
// ligne de tableau (variante 'icone'). Motif « bouton qui déplie une liste »
// (aria-expanded) : Échap, clic à l'extérieur ou choix d'une action le
// referment, et le focus revient au bouton.

export type ActionMenu = {
  cle: string;
  libelle: string;
  icone?: LucideIcon;
  onClick: () => void;
  desactive?: boolean;
  // Action destructrice (désactiver, supprimer) : en rouge.
  danger?: boolean;
  // Trait de séparation avant l'action (la mettre à part des autres).
  separee?: boolean;
};

export function MenuActions({
  actions,
  libelle = 'Plus d’actions',
  className,
  variante = 'texte',
  alignement = 'gauche',
}: {
  actions: ActionMenu[];
  // Variante 'icone' : nom accessible du bouton (« Actions pour … »).
  libelle?: string;
  className?: string;
  variante?: 'texte' | 'icone';
  // Bord du bouton auquel la liste s'aligne (droite : bout de ligne).
  alignement?: 'gauche' | 'droite';
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

  // Bas de l'écran (dernière ligne d'un tableau) : la liste s'ouvre vers le
  // haut si elle déborderait en bas et qu'il y a la place au-dessus.
  const ouvrirVersLeHaut = (liste: HTMLUListElement | null) => {
    if (!liste || !bouton.current) return;
    liste.classList.remove('menu-actions-liste--haut');
    const bas = liste.getBoundingClientRect().bottom;
    const placeAuDessus = bouton.current.getBoundingClientRect().top;
    if (bas > window.innerHeight - 8 && liste.offsetHeight + 16 < placeAuDessus) {
      liste.classList.add('menu-actions-liste--haut');
    }
  };

  const icone = variante === 'icone';
  return (
    <div ref={racine} className={`menu-actions${className ? ` ${className}` : ''}`}>
      <button
        ref={bouton}
        type="button"
        className={icone ? 'menu-actions-bouton--icone' : 'btn-ghost menu-actions-bouton'}
        aria-expanded={ouvert}
        aria-controls={id}
        aria-label={icone ? libelle : undefined}
        title={icone ? libelle : undefined}
        onClick={() => setOuvert((o) => !o)}
      >
        {icone ? (
          <MoreHorizontal size={18} aria-hidden />
        ) : (
          <>
            <MoreHorizontal size={15} aria-hidden /> {libelle}
            <ChevronDown size={14} aria-hidden className={`menu-actions-chevron${ouvert ? ' est-ouvert' : ''}`} />
          </>
        )}
      </button>
      {ouvert && (
        <ul
          id={id}
          ref={ouvrirVersLeHaut}
          className={`menu-actions-liste${alignement === 'droite' ? ' menu-actions-liste--droite' : ''}`}
        >
          {actions.map((a) => {
            const Icone = a.icone;
            return (
              <li key={a.cle} className={a.separee ? 'menu-actions-separee' : undefined}>
                <button
                  type="button"
                  className={a.danger ? 'menu-actions-danger' : undefined}
                  disabled={a.desactive}
                  onClick={() => {
                    // Focus rendu au bouton AVANT l'action : une confirmation
                    // qui s'ouvre le mémorise et y revient à sa fermeture.
                    bouton.current?.focus();
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
