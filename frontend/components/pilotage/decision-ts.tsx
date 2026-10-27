'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { formatAmount, formatDate } from '@hub/domain';
import { decideTsRequest } from '@/features/projects/api';
import type { TsRequestToDecide } from '@/features/projects/types';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

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
  demande: TsRequestToDecide;
  onFait: () => void;
  onClose: () => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(accepter: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      await decideTsRequest(slug, demande.projetId, demande.id, accepter, accepter ? undefined : (refus ?? '').trim());
      onFait();
      onClose();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Décision impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="dts-titre">
      <header className="modal-header">
        <h2 id="dts-titre">Travail supplémentaire · {demande.code}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body da-corps">
        <dl className="da-resume">
          <div>
            <dt>Montant de l’avenant</dt>
            <dd>
              <strong>{formatAmount(demande.montantHt)} HT</strong>
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
              le {formatDate(demande.demandeLe)}
              {demande.demandePar ? ` par ${demande.demandePar}` : ''}
            </dd>
          </div>
        </dl>
        <p className="dmd-note">
          Accepté, il devient une tâche du projet et une ligne de l’avenant à envoyer au client.
        </p>
        {refus !== null && (
          <Field label="Motif du refus (transmis au Dir. GC)">
            <textarea
              className="field-input"
              rows={2}
              maxLength={500}
              value={refus}
              onChange={(e) => setRefus(e.target.value)}
            />
          </Field>
        )}
        {erreur && <FieldError>{erreur}</FieldError>}
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
    </Modal>
  );
}
