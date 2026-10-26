'use client';

import { useState } from 'react';
import { deciderDemandeDroit, type DemandeDroit } from '@/lib/roles';
import { formatDate } from '@/lib/dates';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

const NIVEAU: Record<DemandeDroit['apres'], string> = {
  aucun: 'Aucun',
  lecture: 'Lecture',
  ecriture: 'Écriture',
  validation: 'Validation',
};

// Le CEO valide une modification des droits du rôle CIO (revue CIO,
// 22/10/2026) : acceptée, elle est appliquée et tracée « validée par » ;
// refusée, le motif part au demandeur.
export function DecisionDroit({
  slug,
  demande: d,
  onFait,
  onClose,
}: {
  slug: string;
  demande: DemandeDroit;
  onFait: (restantes: DemandeDroit[]) => void;
  onClose: () => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function decider(accepter: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      onFait(await deciderDemandeDroit(slug, d.id, accepter, accepter ? undefined : refus?.trim()));
      onClose();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La décision n’a pas été enregistrée.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="dd-titre">
      <header className="modal-header">
        <h2 id="dd-titre">Droits du {d.role} à valider</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body da-corps">
        <dl className="da-resume">
          <div>
            <dt>Module</dt>
            <dd>
              <strong>{d.module}</strong>
            </dd>
          </div>
          <div>
            <dt>Changement</dt>
            <dd>
              {NIVEAU[d.avant]} → <strong>{NIVEAU[d.apres]}</strong>
            </dd>
          </div>
          <div>
            <dt>Demandé</dt>
            <dd>
              le {formatDate(d.demandeLe)} par {d.demandePar}
            </dd>
          </div>
        </dl>
        <p className="dmd-note">
          Le CIO ne modifie pas les droits de son propre rôle : rien ne change sans votre accord. Accepté, le changement
          est appliqué et gardé au journal des droits.
        </p>
        {refus !== null && (
          <Field label="Motif du refus (transmis au demandeur)">
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
                {envoi ? 'Application…' : 'Accepter'}
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
                disabled={envoi || refus.trim().length < 3}
                onClick={() => decider(false)}
              >
                {envoi ? 'Envoi…' : 'Refuser la demande'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
