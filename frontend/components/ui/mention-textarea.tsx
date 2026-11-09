'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { stripAccents } from '@hub/domain';
import { PersonAvatar } from '@/components/ui/avatar';

export type MentionPerson = { id: string; nom: string };

const MAX_SUGGESTIONS = 6;
// « @… » en cours de frappe juste avant le curseur : le nom peut avoir
// plusieurs mots (« @Awa Di »), sans retour à la ligne ni autre « @ ».
const TOKEN = /(^|\s)@([^@\n]{0,40})$/u;
const fold = (s: string) => stripAccents(s).toLowerCase();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Fin d'un nom : ni lettre ni chiffre juste après (« @Awa Diopette » ne cite pas « Awa Diop »).
const END = '(?![\\p{L}\\p{N}])';
const nameAt = (nom: string) => new RegExp(`@${escapeRegExp(nom)}${END}`, 'gu');

// Le texte cite-t-il « @Nom » (nom complet) ?
export const citesName = (text: string, nom: string) => nameAt(nom).test(text);

// Personnes citées dans un texte, dans l'ordre du texte :
// - celles choisies dans la liste (`picked`) dont le nom est resté dans le
//   texte — la personne choisie, même si un homonyme existe ;
// - puis un nom tapé en entier sans passer par la liste, s'il ne désigne
//   qu'une personne (deux homonymes : on ne devine pas).
// Les noms les plus longs d'abord (puis masqués, positions gardées), pour
// qu'« @Awa Diop Ndiaye » ne compte pas aussi « @Awa Diop ».
export function mentionIdsIn(text: string, people: MentionPerson[], picked: MentionPerson[] = []): string[] {
  let rest = text;
  const found: { id: string; at: number }[] = [];
  const take = (nom: string, ids: string[]) => {
    const re = nameAt(nom);
    const at = rest.search(re);
    if (at < 0) return;
    ids.forEach((id) => found.push({ id, at }));
    rest = rest.replace(re, (m) => ' '.repeat(m.length));
  };
  const byName = (list: MentionPerson[]) => {
    const map = new Map<string, string[]>();
    for (const p of list) map.set(p.nom, [...new Set([...(map.get(p.nom) ?? []), p.id])]);
    return map;
  };
  // Un nom → ses personnes : les choisies, sinon la seule qui le porte.
  const chosen = byName(picked);
  const candidates = new Map(chosen);
  for (const [nom, ids] of byName(people)) if (!candidates.has(nom) && ids.length === 1) candidates.set(nom, ids);
  // Tous ensemble, du nom le plus long au plus court.
  for (const [nom, ids] of [...candidates.entries()].sort(([a], [b]) => b.length - a.length)) take(nom, ids);
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

// Texte d'un commentaire, mentions surlignées (la sienne davantage) — même
// rendu que la messagerie, même règle de fin de nom que mentionIdsIn.
export function MentionText({ text, mentions, meId }: { text: string; mentions: MentionPerson[]; meId: string }) {
  if (!mentions.length) return <>{text}</>;
  const names = [...new Set(mentions.map((m) => m.nom))].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${names.map((n) => `@${escapeRegExp(n)}${END}`).join('|')})`, 'gu');
  return (
    <>
      {text.split(pattern).map((part, i) => {
        const cited = mentions.filter((x) => `@${x.nom}` === part);
        return cited.length ? (
          <span key={i} className={`pchat-mention${cited.some((m) => m.id === meId) ? ' is-moi' : ''}`}>
            {part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  people: MentionPerson[];
  // Personne choisie dans la liste (l'appelant la garde jusqu'à l'envoi).
  onPick?: (p: MentionPerson) => void;
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
};

// Saisie avec mentions (09/11/2026, comme la messagerie) : « @ » propose les
// noms, la liste se resserre à chaque lettre (accents ignorés) et suit le
// curseur ; flèches, Entrée ou Tab pour choisir, Échap pour fermer. Le nom
// choisi s'insère en entier (« @Awa Diop ») ; à l'envoi, mentionIdsIn ne
// garde que les noms restés dans le texte : un nom effacé ne prévient personne.
export function MentionTextarea({
  value,
  onChange,
  people,
  onPick,
  ariaLabel,
  placeholder,
  rows = 3,
  maxLength,
  disabled,
  className,
}: Props) {
  const listId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // Curseur à poser après l'insertion d'un nom.
  const caretAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (el && caretAfter.current !== null) {
      el.focus();
      el.setSelectionRange(caretAfter.current, caretAfter.current);
      caretAfter.current = null;
    }
  }, [value]);

  const term = query === null ? null : fold(query);
  const suggestions = term === null ? [] : people.filter((p) => fold(p.nom).includes(term)).slice(0, MAX_SUGGESTIONS);
  const open = suggestions.length > 0;
  const activeIndex = Math.min(active, suggestions.length - 1);

  // Jeton « @… » juste avant le curseur (frappe, flèches, clic).
  function track(text: string, caret: number) {
    const m = TOKEN.exec(text.slice(0, caret));
    // Une espace juste avant le curseur ferme la liste (elle se rouvre à la
    // lettre suivante) : pas de liste rouverte juste après un nom inséré.
    const next = m && !/\s$/u.test(m[2]) ? m[2] : null;
    if (next !== query) {
      setQuery(next);
      setActive(0);
    }
  }

  function choose(p: MentionPerson) {
    const caret = field.current?.selectionStart ?? value.length;
    const head = value.slice(0, caret);
    setQuery(null);
    // Plus de jeton avant le curseur : rien à insérer.
    if (!TOKEN.test(head)) return;
    const before = head.replace(TOKEN, (_t, space: string) => `${space}@${p.nom} `);
    const next = before + value.slice(caret);
    if (maxLength !== undefined && next.length > maxLength) return;
    caretAfter.current = before.length;
    onPick?.(p);
    onChange(next);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Composition en cours (accents, IME) : Entrée la termine, rien d'autre.
    if (!open || e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((e.key === 'ArrowDown' ? activeIndex + 1 : activeIndex + suggestions.length - 1) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setQuery(null);
    }
  }

  return (
    <div className="mention-champ">
      {open && (
        <ul className="pchat-mentions" id={listId} role="listbox" aria-label="Mentionner">
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`mention-option${i === activeIndex ? ' is-actif' : ''}`}
              onMouseEnter={() => setActive(i)}
              // Choisi avant que le champ ne perde le focus.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
            >
              <PersonAvatar name={p.nom} photo={null} colorKey={p.id} size="sm" />
              {p.nom}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={field}
        className={className}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${suggestions[activeIndex].id}` : undefined}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        // Curseur déplacé sans frappe (flèches, clic) : la liste suit.
        onSelect={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyDown={onKey}
        // Hors du champ, la liste se ferme.
        onBlur={() => setQuery(null)}
      />
    </div>
  );
}
