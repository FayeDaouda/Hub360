'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SendHorizonal } from 'lucide-react';
import { stripAccents } from '@hub/domain';
import { getMentionnables } from '@/lib/chat';
import type { PersonneChat } from '@/lib/types';
import { PersonAvatar } from '@/components/ui/avatar';

// Saisie d'un message avec mentions (01/11/2026) : « @ » propose les
// personnes qui lisent la conversation ; la personne choisie est prévenue
// par une notification à l'envoi. Une saisie par conversation (key = canal).
const normaliser = (x: string) => stripAccents(x).toLowerCase();
// « @mot » en cours de frappe juste avant le curseur.
const JETON = /(^|\s)@([^\s@]{0,30})$/u;

export function SaisieChat({
  slug,
  canalId,
  moiId,
  envoiEnCours,
  onEnvoyer,
}: {
  slug: string;
  canalId: string;
  moiId: string;
  envoiEnCours: boolean;
  onEnvoyer: (texte: string, mentionIds: string[]) => void;
}) {
  const [brouillon, setBrouillon] = useState('');
  const [personnes, setPersonnes] = useState<PersonneChat[]>([]);
  const [mentions, setMentions] = useState<PersonneChat[]>([]);
  const [recherche, setRecherche] = useState<string | null>(null);
  const [choix, setChoix] = useState(0);
  const champ = useRef<HTMLTextAreaElement>(null);
  // Curseur à poser après l'insertion d'une mention (avant toute autre frappe).
  const curseurApres = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = champ.current;
    if (el && curseurApres.current !== null) {
      el.focus();
      el.setSelectionRange(curseurApres.current, curseurApres.current);
      curseurApres.current = null;
    }
  }, [brouillon]);

  useEffect(() => {
    getMentionnables(slug, canalId)
      .then((l) => setPersonnes(l.filter((p) => p.id !== moiId)))
      .catch(() => setPersonnes([]));
  }, [slug, canalId, moiId]);

  const propositions =
    recherche === null ? [] : personnes.filter((p) => normaliser(p.nom).includes(normaliser(recherche))).slice(0, 6);

  function surFrappe(valeur: string, curseur: number) {
    setBrouillon(valeur);
    const m = JETON.exec(valeur.slice(0, curseur));
    setRecherche(m ? m[2] : null);
    setChoix(0);
  }

  function choisir(p: PersonneChat) {
    const el = champ.current;
    const curseur = el?.selectionStart ?? brouillon.length;
    const avant = brouillon.slice(0, curseur).replace(JETON, (_t, espace: string) => `${espace}@${p.nom} `);
    const suite = avant + brouillon.slice(curseur);
    setBrouillon(suite);
    setMentions((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
    setRecherche(null);
    curseurApres.current = avant.length;
  }

  function envoyer() {
    const t = brouillon.trim();
    if (!t || envoiEnCours) return;
    // Mentions encore présentes dans le texte (une mention effacée ne prévient personne).
    const ids = mentions.filter((p) => t.includes(`@${p.nom}`)).map((p) => p.id);
    setBrouillon('');
    setMentions([]);
    setRecherche(null);
    onEnvoyer(t, ids);
  }

  function surTouche(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (propositions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setChoix((c) => (c + (e.key === 'ArrowDown' ? 1 : propositions.length - 1)) % propositions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choisir(propositions[choix]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setRecherche(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      envoyer();
    }
  }

  return (
    <form
      className="pchat-saisie"
      onSubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
    >
      {propositions.length > 0 && (
        <ul className="pchat-mentions" role="listbox" aria-label="Mentionner">
          {propositions.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === choix}>
              <button
                type="button"
                className={i === choix ? 'is-actif' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(p);
                }}
              >
                <PersonAvatar name={p.nom} photo={p.photoUrl} colorKey={p.id} size="sm" />
                {p.nom}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={champ}
        className="pchat-saisie-champ"
        rows={1}
        placeholder="Message… (@ pour mentionner)"
        value={brouillon}
        maxLength={4000}
        aria-label="Message"
        onChange={(e) => surFrappe(e.target.value, e.target.selectionStart)}
        onKeyDown={surTouche}
      />
      <button
        type="submit"
        className="pchat-saisie-btn"
        disabled={!brouillon.trim() || envoiEnCours}
        aria-label="Envoyer"
      >
        <SendHorizonal size={17} aria-hidden />
      </button>
    </form>
  );
}

// Texte d'un message, mentions surlignées (la sienne davantage).
export function TexteMessage({
  texte,
  mentions,
  moiId,
}: {
  texte: string;
  mentions: { id: string; nom: string }[];
  moiId: string;
}) {
  if (!mentions.length) return <>{texte}</>;
  const echappe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const motif = new RegExp(`(${mentions.map((m) => `@${echappe(m.nom)}`).join('|')})`, 'g');
  return (
    <>
      {texte.split(motif).map((morceau, i) => {
        const m = mentions.find((x) => `@${x.nom}` === morceau);
        return m ? (
          <span key={i} className={`pchat-mention${m.id === moiId ? ' is-moi' : ''}`}>
            {morceau}
          </span>
        ) : (
          morceau
        );
      })}
    </>
  );
}
