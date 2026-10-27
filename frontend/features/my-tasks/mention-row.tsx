'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDayMonth } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { markMentionRead, postComment } from '@/features/projects/api';
import type { MyMention } from '@/features/projects/types';

// Mention : lire, répondre dans le fil (l'auteur est mentionné en retour),
// marquer comme lue, ouvrir la tâche.
export function MentionRow({
  slug,
  m,
  base,
  onOpen,
  onChange,
}: {
  slug: string;
  m: MyMention;
  base: string;
  onOpen: () => void;
  onChange: () => void;
}) {
  const [reply, setReply] = useState<string | null>(null);
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });

  async function run(action: () => Promise<unknown>) {
    setState({ sending: true, error: null });
    try {
      await action();
      setReply(null);
      setState({ sending: false, error: null });
      onChange();
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Action impossible.' });
    }
  }

  const sendReply = () =>
    run(async () => {
      await postComment(slug, m.projetId, {
        ...(m.tacheId ? { tacheId: m.tacheId } : { carteId: m.carteId }),
        parentId: m.racineId,
        texte: reply!.trim(),
        mentionneId: m.auteurId,
      });
      await markMentionRead(slug, m.id);
    });

  return (
    <li
      className={`mt-ligne mt-mention${m.tacheId ? ' mt-ligne--ouvrable' : ''}${m.lue ? ' is-lue' : ''}`}
      data-ton={m.lue ? 'neutre' : 'iris'}
      // Comme une tâche : toute la ligne ouvre la tâche mentionnée.
      onClick={(e) => {
        if (!m.tacheId || (e.target as HTMLElement).closest('button, a, input, label, select, textarea')) return;
        onOpen();
      }}
    >
      <span className="mt-corps">
        <span className="mt-titre">
          {!m.lue && <span className="mt-nouveau" aria-label="Non lue" />}
          {m.auteur ?? 'Quelqu’un'} vous mentionne
        </span>
        <span className="mt-mention-texte">« {m.texte} »</span>
        <span className="mt-meta">
          <Link className="mt-code" href={`${base}/projets?projet=${m.projetId}`}>
            {m.projetCode}
          </Link>
          <span>{m.cible}</span>
        </span>
        {reply !== null && (
          <span className="mt-reponse">
            <textarea
              className="field-input"
              rows={2}
              maxLength={2000}
              placeholder={`Répondre à ${m.auteur ?? 'l’auteur'}…`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              autoFocus
            />
            <span className="dmd-actions">
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                disabled={state.sending}
                onClick={() => setReply(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                disabled={state.sending || !reply.trim()}
                onClick={sendReply}
              >
                Envoyer
              </button>
            </span>
          </span>
        )}
        {state.error && <span className="field-erreur">{state.error}</span>}
      </span>
      <span className="mt-echeance">
        <span className="mt-echeance-rel">le {formatDayMonth(m.creeLe)}</span>
        <span className="mt-echeance-date">{m.lue ? 'lue' : 'non lue'}</span>
      </span>
      <span className="mt-action">
        {reply === null && (
          <button type="button" className="btn-primary btn-primary--sm" onClick={() => setReply('')}>
            Répondre
          </button>
        )}
        {!m.lue && reply === null && (
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            disabled={state.sending}
            onClick={() => run(() => markMentionRead(slug, m.id))}
          >
            Marquer lu
          </button>
        )}
        {m.tacheId && reply === null && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onOpen}>
            Ouvrir
          </button>
        )}
      </span>
    </li>
  );
}
