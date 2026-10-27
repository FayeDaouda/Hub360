'use client';

import { useCallback, useEffect, useState } from 'react';
import { Infobulle } from '@/components/infobulle';
import { FieldError } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { formatDate } from '@hub/domain';
import { getThread, postComment, resolveComment } from './api';
import type { ThreadComment, ThreadRoot } from './types';

type Props = {
  slug: string;
  projectId: string;
  // Fil d'une carte, ou d'une tâche (l'un ou l'autre).
  cardId?: string;
  taskId?: string;
  meId: string;
  // null = lecture seule (pas d'écriture sur Projets).
  mentionable: { id: string; nom: string }[] | null;
  onUpdate: () => Promise<void>; // compteurs du dossier (« Fil de la carte · N »)
};

// Fil de discussion d'une carte ou d'une tâche (maquette « Projets ») : une
// @mention notifie la personne ; le commentaire reste ouvert jusqu'à une
// réponse ou sa résolution par l'auteur. Une autre cible = un autre fil :
// l'appelant le remonte (key), sa saisie repart de zéro.
export function ThreadView({ slug, projectId, cardId, taskId, meId, mentionable, onUpdate }: Props) {
  const target = taskId ? { tacheId: taskId } : { carteId: cardId! };
  const [thread, setThread] = useState<ThreadRoot[] | null>(null);
  const [text, setText] = useState('');
  const [mention, setMention] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadRoot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => getThread(slug, projectId, taskId ? { tacheId: taskId } : { carteId: cardId! }),
    [slug, projectId, cardId, taskId],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((t) => !cancelled && setThread(t))
      .catch(() => !cancelled && setThread([]));
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      const [reloaded] = await Promise.all([load(), onUpdate()]);
      setThread(reloaded);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!text.trim()) return;
    const ok = await act(() =>
      postComment(slug, projectId, {
        ...target,
        texte: text.trim(),
        mentionneId: mention || null,
        parentId: replyTo?.id,
      }),
    );
    if (ok) {
      setText('');
      setMention('');
      setReplyTo(null);
    }
  }

  return (
    <div className="po-panneau-bloc po-fil">
      <p className="tp-section">
        Discussion{thread && thread.length > 0 ? ` · ${thread.length}` : ''}{' '}
        <Infobulle>
          Une @mention notifie la personne. Un commentaire reste ouvert jusqu’à une réponse, ou jusqu’à ce que son
          auteur le marque résolu.
        </Infobulle>
      </p>
      {!thread ? (
        <p className="po-aide">Chargement…</p>
      ) : (
        thread.length > 0 && (
          <ul className="po-fil-liste">
            {thread.map((c) => (
              <li key={c.id} className={c.ouvert ? 'is-ouvert' : undefined}>
                <Message m={c} />
                {c.reponses.map((r) => (
                  <div key={r.id} className="po-fil-reponse">
                    <Message m={r} />
                  </div>
                ))}
                <div className="po-fil-actions">
                  {c.ouvert && <Pill tone="attention">Ouvert</Pill>}
                  {c.resoluLe && <span className="po-aide">Résolu le {formatDate(c.resoluLe)}</span>}
                  {mentionable && c.reponses.length === 0 && !c.resoluLe && (
                    <button type="button" className="po-lien" onClick={() => setReplyTo(c)}>
                      Répondre
                    </button>
                  )}
                  {c.ouvert && c.auteur?.id === meId && (
                    <button
                      type="button"
                      className="po-lien"
                      disabled={busy}
                      onClick={() => act(() => resolveComment(slug, projectId, c.id))}
                    >
                      Résoudre
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      {mentionable && (
        <>
          {replyTo && (
            <p className="po-aide">
              Réponse à {replyTo.auteur?.nom ?? 'un commentaire'} ·{' '}
              <button type="button" className="po-lien" onClick={() => setReplyTo(null)}>
                annuler
              </button>
            </p>
          )}
          <textarea
            className="field-input po-fil-texte"
            aria-label="Écrire un commentaire"
            placeholder="Écrire un commentaire…"
            rows={3}
            maxLength={2000}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="po-fil-envoi">
            <select
              className="field-input"
              aria-label="Mentionner"
              value={mention}
              disabled={busy}
              onChange={(e) => setMention(e.target.value)}
            >
              <option value="">Mentionner…</option>
              {mentionable
                .filter((p) => p.id !== meId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
            </select>
            <button type="button" className="btn-primary" disabled={busy || !text.trim()} onClick={publish}>
              Publier
            </button>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </>
      )}
    </div>
  );
}

function Message({ m }: { m: ThreadComment }) {
  return (
    <div className="po-fil-message">
      <p className="po-aide">
        <strong>{m.auteur?.nom ?? 'Compte supprimé'}</strong> · {formatDate(m.le)}
        {m.mentionne && <span className="po-fil-mention"> @{m.mentionne.nom}</span>}
      </p>
      <p>{m.texte}</p>
    </div>
  );
}
