'use client';

import type { RefObject } from 'react';
import { STATUTS_CELLULE } from '@/lib/equipes';
import { allerA } from '@/lib/defilement';
import type { CelluleEquipe } from '@/lib/types';

export const ancreCellule = (id: string) => `cellule-${id}`;

// Sommaire des cellules (Équipes, lot S3 du défilement, 24/10/2026) : grand
// écran, en tête de la colonne de droite collée ; tablette et téléphone, barre
// de raccourcis collée sous la barre du haut (.entete-fixe). La cellule en
// lecture s'allume ; un clic y mène.
export function SommaireCellules({
  cellules,
  enLecture,
  compact,
  barre,
}: {
  cellules: CelluleEquipe[];
  enLecture: string | undefined;
  compact: boolean;
  barre?: RefObject<HTMLElement | null>;
}) {
  if (compact) {
    return (
      <nav ref={barre} className="entete-fixe eq-raccourcis" aria-label="Aller à la cellule">
        <div className="eq-raccourcis-liste">
          {cellules.map((c) => {
            const actif = ancreCellule(c.id) === enLecture;
            return (
              <button
                key={c.id}
                type="button"
                className={`puce-ancre eq-raccourci${actif ? ' is-actif' : ''}`}
                aria-current={actif ? 'true' : undefined}
                title={c.nom}
                onClick={() => allerA(ancreCellule(c.id))}
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
      <h2 id="eq-sommaire-titre">Cellules · {cellules.length}</h2>
      <ul>
        {cellules.map((c) => {
          const actif = ancreCellule(c.id) === enLecture;
          const statut = STATUTS_CELLULE[c.statut];
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`eq-sommaire-lien${actif ? ' is-actif' : ''}`}
                aria-current={actif ? 'true' : undefined}
                onClick={() => allerA(ancreCellule(c.id))}
              >
                <span className={`eq-sommaire-point eq-sommaire-point--${statut.ton}`} aria-hidden />
                <span className="eq-code">{c.code}</span>
                <span className="eq-sommaire-nom">{c.nom}</span>
                <span className="sr-only"> · {statut.libelle}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
