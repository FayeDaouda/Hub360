'use client';

import { useMemo, useState } from 'react';
import { normaliserRecherche } from '@/lib/localites';
import { ZONES_LOCALITE, type Localite } from '@/lib/types';

type Props = {
  localites: Localite[] | null; // null = chargement
  valeur: string; // id de la localité choisie, '' si aucune
  onChange: (id: string) => void;
  idChamp?: string;
};

// Choix d'une localité du référentiel : un filtre texte au-dessus d'un
// <select> natif groupé (zone — département/région/zone). Natif plutôt qu'une
// combobox maison : sélecteur système sur mobile, clavier et lecteurs d'écran
// gérés d'office. L'intervenant ne tape jamais le code, il le voit seulement.
export function LocaliteSelect({ localites, valeur, onChange, idChamp }: Props) {
  const [filtre, setFiltre] = useState('');

  const groupes = useMemo(() => {
    const terme = normaliserRecherche(filtre.trim());
    const map = new Map<string, Localite[]>();
    for (const l of localites ?? []) {
      const correspond =
        !terme ||
        l.id === valeur || // la sélection courante reste toujours visible
        normaliserRecherche([l.nom, l.code, l.region, l.commune ?? ''].join(' ')).includes(terme);
      if (!correspond) continue;
      const cle = `${ZONES_LOCALITE[l.zone]} — ${l.region}`;
      map.set(cle, [...(map.get(cle) ?? []), l]);
    }
    return [...map.entries()];
  }, [localites, filtre, valeur]);

  const nbResultats = groupes.reduce((n, [, ls]) => n + ls.length, 0);

  function filtrer(texte: string) {
    setFiltre(texte);
    // Un seul résultat → sélection directe, pas de second geste.
    const terme = normaliserRecherche(texte.trim());
    if (!terme || !localites) return;
    const trouves = localites.filter((l) =>
      normaliserRecherche([l.nom, l.code, l.region, l.commune ?? ''].join(' ')).includes(terme),
    );
    if (trouves.length === 1) onChange(trouves[0].id);
  }

  return (
    <div className="localite-select">
      <input
        type="search"
        className="field-input"
        value={filtre}
        onChange={(e) => filtrer(e.target.value)}
        placeholder="Rechercher (nom, code, région)…"
        aria-label="Filtrer les localités"
        disabled={!localites}
      />
      <select
        id={idChamp}
        className="field-input"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        disabled={!localites}
      >
        <option value="">
          {!localites
            ? 'Chargement…'
            : nbResultats === 0
              ? 'Aucune localité ne correspond'
              : 'Choisir une localité…'}
        </option>
        {groupes.map(([groupe, ls]) => (
          <optgroup key={groupe} label={groupe}>
            {ls.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom} ({l.code})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
