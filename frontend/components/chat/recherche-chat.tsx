'use client';

import { useEffect, useState } from 'react';
import { formatDayMonth, formatTime } from '@hub/domain';
import { rechercherMessages } from '@/lib/chat';
import type { ResultatRechercheChat } from '@/lib/types';

// Recherche dans ses conversations (02/11/2026) : résultats au fil de la
// frappe (300 ms), le terme surligné ; un clic ouvre la conversation sur le
// message.
export function RechercheChat({
  slug,
  q,
  onOuvrir,
}: {
  slug: string;
  q: string;
  onOuvrir: (canalId: string, messageId: string) => void;
}) {
  const [resultats, setResultats] = useState<ResultatRechercheChat[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      rechercherMessages(slug, q)
        .then(setResultats)
        .catch(() => setResultats([]));
    }, 300);
    return () => clearTimeout(t);
  }, [slug, q]);

  if (resultats === null) return <p className="pchat-vide">Recherche…</p>;
  if (!resultats.length) return <p className="pchat-vide">Aucun message ne contient « {q.trim()} ».</p>;
  const terme = q.trim().toLowerCase();
  return (
    <ul className="pchat-liste pchat-resultats">
      {resultats.map((r) => {
        const i = r.texte.toLowerCase().indexOf(terme);
        const debut = Math.max(0, i - 40);
        const extrait = r.texte.slice(debut, i + terme.length + 60);
        const pos = i - debut;
        return (
          <li key={r.id}>
            <button type="button" className="pchat-resultat" onClick={() => onOuvrir(r.canalId, r.id)}>
              <span className="pchat-resultat-tete">
                <strong>{r.canal}</strong>
                <span>
                  {r.auteur} · {formatDayMonth(r.envoyeLe.slice(0, 10))} {formatTime(r.envoyeLe)}
                </span>
              </span>
              <span className="pchat-resultat-texte">
                {debut > 0 && '…'}
                {i < 0 ? (
                  extrait
                ) : (
                  <>
                    {extrait.slice(0, pos)}
                    <mark>{extrait.slice(pos, pos + terme.length)}</mark>
                    {extrait.slice(pos + terme.length)}
                  </>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
