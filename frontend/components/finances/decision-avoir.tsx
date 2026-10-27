'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { deciderAvoir, LIBELLE_MOTIF_AVOIR, type AvoirAValider } from '@/lib/facturation';
import { formatAmount, formatDate } from '@hub/domain';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

// Avoir au-delà du seuil (contrôle interne, revue CFO 20/10/2026) : le CEO
// le valide (l'avoir est émis, la facture annulée) ou le refuse avec un motif.
export function DecisionAvoir({
  slug,
  avoir,
  onFait,
  onClose,
}: {
  slug: string;
  avoir: AvoirAValider;
  onFait: (l: AvoirAValider[]) => void;
  onClose: () => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(valide: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await deciderAvoir(slug, avoir.id, valide, valide ? undefined : (refus ?? '').trim()));
      onClose();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Décision impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="dav-titre">
      <header className="modal-header">
        <h2 id="dav-titre">Avoir sur {avoir.reference ?? 'la facture'}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body da-corps">
        <dl className="da-resume">
          <div>
            <dt>Montant annulé</dt>
            <dd>
              <strong>{formatAmount(avoir.montantTtc)} TTC</strong>
            </dd>
          </div>
          <div>
            <dt>Facture</dt>
            <dd>{[avoir.client, avoir.projet, avoir.libelle].filter(Boolean).join(' · ')}</dd>
          </div>
          <div>
            <dt>Motif</dt>
            <dd>
              {LIBELLE_MOTIF_AVOIR[avoir.motif]} : {avoir.commentaire}
            </dd>
          </div>
          <div>
            <dt>Demandé</dt>
            <dd>
              le {formatDate(avoir.demandeLe)}
              {avoir.demandePar ? ` par ${avoir.demandePar}` : ''}
            </dd>
          </div>
        </dl>
        {!avoir.peutDecider && (
          <p className="dmd-note">Vous avez fait cette demande : elle doit être validée par un autre CEO.</p>
        )}
        {refus !== null && (
          <Field label="Motif du refus (transmis au demandeur)">
            <textarea
              className="field-input"
              rows={2}
              maxLength={300}
              value={refus}
              onChange={(e) => setRefus(e.target.value)}
            />
          </Field>
        )}
        {erreur && <FieldError>{erreur}</FieldError>}
        {avoir.peutDecider && (
          <div className="modal-actions">
            {refus === null ? (
              <>
                <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setRefus('')}>
                  Refuser
                </button>
                <button type="button" className="btn-primary" disabled={envoi} onClick={() => decider(true)}>
                  Valider et émettre l’avoir
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
        )}
      </div>
    </Modal>
  );
}
