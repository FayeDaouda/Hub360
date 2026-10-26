'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getFil,
  publierCommentaire,
  resoudreCommentaire,
  type CommentaireFil,
  type MessageFil,
} from '@/lib/projets-ouverts';
import { Infobulle } from '@/components/infobulle';
import { formatDate } from '@/lib/dates';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  projetId: string;
  // Fil d'une carte, ou d'une tâche (l'un ou l'autre).
  carteId?: string;
  tacheId?: string;
  moiId: string;
  // null = lecture seule (pas d'écriture sur Projets).
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>; // compteurs du dossier (« Fil de la carte · N »)
};

// Fil de discussion d'une carte ou d'une tâche (maquette « Projets ») : une
// @mention notifie la personne ; le commentaire reste ouvert jusqu'à une
// réponse ou sa résolution par l'auteur.
export function FilDiscussion({ slug, projetId, carteId, tacheId, moiId, mentionnables, onMaj }: Props) {
  const cible = tacheId ? { tacheId } : { carteId: carteId! };
  const [fil, setFil] = useState<CommentaireFil[] | null>(null);
  const [texte, setTexte] = useState('');
  const [mention, setMention] = useState('');
  const [reponseA, setReponseA] = useState<CommentaireFil | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setFil(await getFil(slug, projetId, tacheId ? { tacheId } : { carteId: carteId! }));
  }, [slug, projetId, carteId, tacheId]);

  useEffect(() => {
    setFil(null);
    setTexte('');
    setMention('');
    setReponseA(null);
    setErreur(null);
    charger().catch(() => setFil([]));
  }, [charger]);

  async function agir(action: () => Promise<unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      await Promise.all([charger(), onMaj()]);
      return true;
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function publier() {
    if (!texte.trim()) return;
    const ok = await agir(() =>
      publierCommentaire(slug, projetId, {
        ...cible,
        texte: texte.trim(),
        mentionneId: mention || null,
        parentId: reponseA?.id,
      }),
    );
    if (ok) {
      setTexte('');
      setMention('');
      setReponseA(null);
    }
  }

  return (
    <div className="po-panneau-bloc po-fil">
      <p className="tp-section">
        Discussion{fil && fil.length > 0 ? ` · ${fil.length}` : ''}{' '}
        <Infobulle>
          Une @mention notifie la personne. Un commentaire reste ouvert jusqu’à une réponse, ou jusqu’à ce que son
          auteur le marque résolu.
        </Infobulle>
      </p>
      {!fil ? (
        <p className="po-aide">Chargement…</p>
      ) : (
        fil.length > 0 && (
          <ul className="po-fil-liste">
            {fil.map((c) => (
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
                  {mentionnables && c.reponses.length === 0 && !c.resoluLe && (
                    <button type="button" className="po-lien" onClick={() => setReponseA(c)}>
                      Répondre
                    </button>
                  )}
                  {c.ouvert && c.auteur?.id === moiId && (
                    <button
                      type="button"
                      className="po-lien"
                      disabled={enCours}
                      onClick={() => agir(() => resoudreCommentaire(slug, projetId, c.id))}
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
      {mentionnables && (
        <>
          {reponseA && (
            <p className="po-aide">
              Réponse à {reponseA.auteur?.nom ?? 'un commentaire'} ·{' '}
              <button type="button" className="po-lien" onClick={() => setReponseA(null)}>
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
            value={texte}
            disabled={enCours}
            onChange={(e) => setTexte(e.target.value)}
          />
          <div className="po-fil-envoi">
            <select
              className="field-input"
              aria-label="Mentionner"
              value={mention}
              disabled={enCours}
              onChange={(e) => setMention(e.target.value)}
            >
              <option value="">Mentionner…</option>
              {mentionnables
                .filter((p) => p.id !== moiId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
            </select>
            <button type="button" className="btn-primary" disabled={enCours || !texte.trim()} onClick={publier}>
              Publier
            </button>
          </div>
          {erreur && <FieldError>{erreur}</FieldError>}
        </>
      )}
    </div>
  );
}

function Message({ m }: { m: MessageFil }) {
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
