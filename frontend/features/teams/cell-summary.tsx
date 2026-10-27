'use client';

import type { RefObject } from 'react';
import { allerA } from '@/lib/defilement';
import { CELL_STATUSES } from './constants';
import type { TeamCell } from './types';

export const cellAnchor = (id: string) => `cellule-${id}`;

// Sommaire des cellules (Équipes, lot S3 du défilement, 24/10/2026) : grand
// écran, en tête de la colonne de droite collée ; tablette et téléphone, barre
// de raccourcis collée sous la barre du haut (.entete-fixe). La cellule en
// lecture s'allume ; un clic y mène.
export function CellSummary({
  cells,
  reading,
  compact,
  bar,
}: {
  cells: TeamCell[];
  reading: string | undefined;
  compact: boolean;
  bar?: RefObject<HTMLElement | null>;
}) {
  if (compact) {
    return (
      <nav ref={bar} className="entete-fixe eq-raccourcis" aria-label="Aller à la cellule">
        <div className="eq-raccourcis-liste">
          {cells.map((c) => {
            const active = cellAnchor(c.id) === reading;
            return (
              <button
                key={c.id}
                type="button"
                className={`puce-ancre eq-raccourci${active ? ' is-actif' : ''}`}
                aria-current={active ? 'true' : undefined}
                title={c.nom}
                onClick={() => allerA(cellAnchor(c.id))}
              >
                {c.code}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }
  return (
    <nav className="panel glass-panel eq-sommaire" aria-labelledby="eq-sommaire-titre">
      <h2 id="eq-sommaire-titre">Cellules · {cells.length}</h2>
      <ul>
        {cells.map((c) => {
          const active = cellAnchor(c.id) === reading;
          const status = CELL_STATUSES[c.statut];
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`eq-sommaire-lien${active ? ' is-actif' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => allerA(cellAnchor(c.id))}
              >
                <span className={`eq-sommaire-point eq-sommaire-point--${status.ton}`} aria-hidden />
                <span className="eq-code">{c.code}</span>
                <span className="eq-sommaire-nom">{c.nom}</span>
                <span className="sr-only"> · {status.libelle}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
