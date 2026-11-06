'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, MapPin, Search, X } from 'lucide-react';
import { normaliserRecherche } from '@/lib/localites';
import { ZONES_LOCALITE, type Localite } from '@/lib/types';

type Props = {
  localites: Localite[] | null; // null = chargement
  valeur: string; // id de la localité choisie, '' si aucune
  onChange: (id: string) => void;
  idChamp?: string;
};

const MAX_RESULTATS = 60;

// Texte cherché d'une localité : nom, code, région, arrondissement, commune.
const texteDe = (l: Localite) =>
  normaliserRecherche([l.nom, l.code, l.region, l.arrondissement ?? '', l.commune ?? ''].join(' '));

// Rang d'une localité pour un terme : le nom ou le code qui commence par le
// terme d'abord, puis un mot du nom, puis le reste.
function rang(l: Localite, terme: string): number {
  const nom = normaliserRecherche(l.nom);
  if (nom.startsWith(terme) || normaliserRecherche(l.code).startsWith(terme)) return 0;
  if (nom.split(/[\s'-]+/).some((m) => m.startsWith(terme))) return 1;
  return 2;
}

// Morceau du nom surligné là où le terme apparaît (accents ignorés).
function Surligne({ texte, terme }: { texte: string; terme: string }) {
  const i = terme ? normaliserRecherche(texte).indexOf(terme) : -1;
  if (i < 0) return <>{texte}</>;
  return (
    <>
      {texte.slice(0, i)}
      <mark>{texte.slice(i, i + terme.length)}</mark>
      {texte.slice(i + terme.length)}
    </>
  );
}

// Choix d'une localité du référentiel par recherche (06/11/2026) : on tape
// quelques lettres du nom, du code, de la région ou de la commune (accents
// ignorés), les résultats arrivent triés et regroupés par zone ; flèches,
// Entrée et Échap au clavier. La liste se déplie sous le champ (jamais rognée
// par une fenêtre) ; l'intervenant ne tape jamais le code, il le voit.
export function LocaliteSelect({ localites, valeur, onChange, idChamp }: Props) {
  const idListe = useId();
  const [saisie, setSaisie] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const choisie = localites?.find((l) => l.id === valeur) ?? null;
  const terme = normaliserRecherche(saisie.trim());

  const resultats = useMemo(() => {
    const liste = (localites ?? []).filter((l) => !terme || texteDe(l).includes(terme));
    if (terme) liste.sort((a, b) => rang(a, terme) - rang(b, terme) || a.nom.localeCompare(b.nom, 'fr'));
    return liste.slice(0, MAX_RESULTATS);
  }, [localites, terme]);
  const total = useMemo(
    () => (terme ? (localites ?? []).filter((l) => texteDe(l).includes(terme)).length : (localites?.length ?? 0)),
    [localites, terme],
  );
  // Groupes « Zone — région », dans l'ordre des résultats.
  const groupes = useMemo(() => {
    const map = new Map<string, Localite[]>();
    for (const l of resultats) {
      const cle = `${ZONES_LOCALITE[l.zone]} — ${l.region}`;
      map.set(cle, [...(map.get(cle) ?? []), l]);
    }
    return [...map.entries()];
  }, [resultats]);
  const ordre = groupes.flatMap(([, ls]) => ls);

  function choisir(l: Localite) {
    onChange(l.id);
    setSaisie('');
    setOuvert(false);
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOuvert(true);
      if (ordre.length) setActif((i) => (i + (e.key === 'ArrowDown' ? 1 : ordre.length - 1)) % ordre.length);
    } else if (e.key === 'Enter' && ouvert && ordre[actif]) {
      e.preventDefault();
      choisir(ordre[actif]);
    } else if (e.key === 'Escape' && ouvert) {
      e.stopPropagation();
      setOuvert(false);
      setSaisie('');
    }
  }

  const libelleChoisie = choisie ? `${choisie.nom} (${choisie.code})` : '';

  return (
    <div className={`localite-select${ouvert ? ' is-ouvert' : ''}`}>
      <div className="localite-champ">
        {choisie && !ouvert ? (
          <MapPin size={16} aria-hidden className="localite-icone localite-icone--choisie" />
        ) : (
          <Search size={16} aria-hidden className="localite-icone" />
        )}
        <input
          ref={champ}
          id={idChamp}
          className="field-input"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={idListe}
          aria-autocomplete="list"
          aria-activedescendant={ouvert && ordre[actif] ? `${idListe}-${ordre[actif].id}` : undefined}
          autoComplete="off"
          disabled={!localites}
          placeholder={!localites ? 'Chargement…' : 'Rechercher une localité (nom, code, région)…'}
          value={ouvert ? saisie : libelleChoisie}
          onFocus={() => {
            setOuvert(true);
            setActif(0);
          }}
          onBlur={() => {
            setOuvert(false);
            setSaisie('');
          }}
          onChange={(e) => {
            setSaisie(e.target.value);
            setOuvert(true);
            setActif(0);
          }}
          onKeyDown={surTouche}
        />
        {choisie && !ouvert && (
          <button
            type="button"
            className="localite-effacer"
            aria-label="Effacer la localité"
            onClick={() => {
              onChange('');
              champ.current?.focus();
            }}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      {ouvert && localites && (
        <div className="localite-resultats" id={idListe} role="listbox" aria-label="Localités">
          <p className="localite-compte" aria-live="polite">
            {total === 0
              ? `Aucune localité pour « ${saisie.trim()} »`
              : terme
                ? `${total} résultat${total > 1 ? 's' : ''}${total > MAX_RESULTATS ? ` · les ${MAX_RESULTATS} premiers, précisez` : ''}`
                : `${total} localités · tapez pour chercher`}
          </p>
          {groupes.map(([groupe, ls]) => (
            <div key={groupe} role="group" aria-label={groupe}>
              <p className="localite-groupe">{groupe}</p>
              {ls.map((l) => {
                const i = ordre.indexOf(l);
                return (
                  <div
                    key={l.id}
                    id={`${idListe}-${l.id}`}
                    role="option"
                    aria-selected={l.id === valeur}
                    className={`localite-option${i === actif ? ' is-actif' : ''}${l.id === valeur ? ' is-choisie' : ''}`}
                    onMouseEnter={() => setActif(i)}
                    // Choisi avant que le champ ne perde le focus.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choisir(l);
                    }}
                  >
                    <span className="localite-option-nom">
                      <span>
                        <Surligne texte={l.nom} terme={terme} />
                      </span>
                      {l.commune && l.commune !== l.nom && <span className="localite-option-sous">{l.commune}</span>}
                    </span>
                    <span className="localite-option-code">{l.code}</span>
                    {l.id === valeur && <Check size={14} aria-hidden className="localite-option-coche" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
