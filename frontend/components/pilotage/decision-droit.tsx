'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { deciderDemandeDroit, type DemandeDroit } from '@/lib/roles';

const NIVEAU: Record<DemandeDroit['apres'], string> = {
  aucun: 'Aucun',
  lecture: 'Lecture',
  ecriture: 'Écriture',
  validation: 'Validation',
};
const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

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

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi]);

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

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dd-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="dd-titre">Droits du {d.role} à valider</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} />
          </button>
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
                le {jjmmaaaa(d.demandeLe)} par {d.demandePar}
              </dd>
            </div>
          </dl>
          <p className="dmd-note">
            Le CIO ne modifie pas les droits de son propre rôle : rien ne change sans votre accord. Accepté, le
            changement est appliqué et gardé au journal des droits.
          </p>
          {refus !== null && (
            <label className="field">
              <span className="field-label">Motif du refus (transmis au demandeur)</span>
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
      </div>
    </div>,
    document.body,
  );
}
