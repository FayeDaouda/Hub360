'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { formatMontant } from '@/lib/format';
import { deciderDemandeTs, type DemandeTsADecider } from '@/lib/projets-ouverts';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// TS au-delà du seuil (revue Dir. GC, 21/10/2026) : le CTO l'accepte — il est
// ajouté au projet et à l'avenant — ou le refuse avec un motif, transmis au
// Dir. GC qui l'a demandé.
export function DecisionTs({
  slug,
  demande,
  onFait,
  onClose,
}: {
  slug: string;
  demande: DemandeTsADecider;
  onFait: () => void;
  onClose: () => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi]);

  async function decider(accepter: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      await deciderDemandeTs(slug, demande.projetId, demande.id, accepter, accepter ? undefined : (refus ?? '').trim());
      onFait();
      onClose();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Décision impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dts-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="dts-titre">Travail supplémentaire · {demande.code}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body da-corps">
          <dl className="da-resume">
            <div>
              <dt>Montant de l’avenant</dt>
              <dd>
                <strong>{formatMontant(demande.montantHt)} HT</strong>
              </dd>
            </div>
            <div>
              <dt>Élément</dt>
              <dd>
                {demande.element} · reprise {demande.reprise}
              </dd>
            </div>
            <div>
              <dt>Projet</dt>
              <dd>
                {demande.client} · {demande.code}
              </dd>
            </div>
            <div>
              <dt>Demandé</dt>
              <dd>
                le {jjmmaaaa(demande.demandeLe)}
                {demande.demandePar ? ` par ${demande.demandePar}` : ''}
              </dd>
            </div>
          </dl>
          <p className="dmd-note">
            Accepté, il devient une tâche du projet et une ligne de l’avenant à envoyer au client.
          </p>
          {refus !== null && (
            <label className="field">
              <span className="field-label">Motif du refus (transmis au Dir. GC)</span>
              <textarea
                className="field-input"
                rows={2}
                maxLength={500}
                value={refus}
                onChange={(e) => setRefus(e.target.value)}
              />
            </label>
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            {refus === null ? (
              <>
                <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRefus('')}>
                  Refuser
                </button>
                <button type="button" className="btn-primary" disabled={envoi} onClick={() => decider(true)}>
                  {envoi ? 'Ajout…' : 'Accepter et ajouter le TS'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRefus(null)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={envoi || !refus.trim()}
                  onClick={() => decider(false)}
                >
                  Confirmer le refus
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
