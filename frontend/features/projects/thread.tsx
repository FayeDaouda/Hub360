'use client';

import { useCallback, useEffect, useState } from 'react';
import { Infobulle } from '@/components/infobulle';
import { FieldError } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import {
  MentionText,
  MentionTextarea,
  citesName,
  mentionIdsIn,
  type MentionPerson,
} from '@/components/ui/mention-textarea';
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
// @mention notifie chaque personne citée — « @ » propose les noms dans la
// saisie (09/11/2026, comme la messagerie) ; le commentaire reste ouvert
// jusqu'à une réponse ou sa résolution par l'auteur. Une autre cible = un autre fil :
// l'appelant le remonte (key), sa saisie repart de zéro.
export function ThreadView({ slug, projectId, cardId, taskId, meId, mentionable, onUpdate }: Props) {
  const target = taskId ? { tacheId: taskId } : { carteId: cardId! };
  const [thread, setThread] = useState<ThreadRoot[] | null>(null);
  const [text, setText] = useState('');
  // Personnes choisies dans la liste « @ » (la bonne, même avec un homonyme).
  const [picked, setPicked] = useState<MentionPerson[]>([]);
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

  // On ne se mentionne pas soi-même.
  const people = (mentionable ?? []).filter((p) => p.id !== meId);

  async function publish() {
    const texte = text.trim();
    if (!texte) return;
    const ok = await act(() =>
      postComment(slug, projectId, {
        ...target,
        texte,
        mentionIds: mentionIdsIn(texte, people, picked),
        parentId: replyTo?.id,
      }),
    );
    if (ok) {
      setText('');
      setPicked([]);
      setReplyTo(null);
    }
  }

  return (
    <div className="po-panneau-bloc po-fil">
      <p className="tp-section">
        Discussion{thread && thread.length > 0 ? ` · ${thread.length}` : ''}{' '}
        <Infobulle>
          Tapez @ puis le début d’un nom pour mentionner quelqu’un : chaque personne citée est prévenue. Un commentaire
          reste ouvert jusqu’à une réponse, ou jusqu’à ce que son auteur le marque résolu.
        </Infobulle>
      </p>
      {!thread ? (
        <p className="po-aide">Chargement…</p>
      ) : (
        thread.length > 0 && (
          <ul className="po-fil-liste">
            {thread.map((c) => (
              <li key={c.id} className={c.ouvert ? 'is-ouvert' : undefined}>
                <Message m={c} meId={meId} />
                {c.reponses.map((r) => (
                  <div key={r.id} className="po-fil-reponse">
                    <Message m={r} meId={meId} />
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
          <MentionTextarea
            className="field-input po-fil-texte"
            ariaLabel="Écrire un commentaire"
            placeholder="Écrire un commentaire… (@ pour mentionner)"
            rows={3}
            maxLength={2000}
            value={text}
            disabled={busy}
            people={people}
            onPick={(p) => setPicked((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]))}
            onChange={setText}
          />
          <div className="po-fil-envoi">
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

// Un commentaire : mentions surlignées dans le texte ; celles que le texte ne
// cite pas (avant le 09/11/2026, on choisissait la personne à part) restent
// affichées à côté de l'auteur.
function Message({ m, meId }: { m: ThreadComment; meId: string }) {
  const apart = m.mentions.filter((p) => !citesName(m.texte, p.nom));
  return (
    <div className="po-fil-message">
      <p className="po-aide">
        <strong>{m.auteur?.nom ?? 'Compte supprimé'}</strong> · {formatDate(m.le)}
        {apart.map((p) => (
          <span key={p.id} className="po-fil-mention">
            {' '}
            @{p.nom}
          </span>
        ))}
      </p>
      <p>
        <MentionText text={m.texte} mentions={m.mentions} meId={meId} />
      </p>
    </div>
  );
}
