'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { deciderAvoir, LIBELLE_MOTIF_AVOIR, type AvoirAValider } from '@/lib/facturation';
import { formatMontant } from '@/lib/format';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// Avoir au-delà du seuil (contrôle interne, revue CFO 20/10/2026) : le CEO
// le valide (l'avoir est émis, la facture annulée) ou le refuse avec un motif.
export function DecisionAvoir({ slug, avoir, onFait, onClose }: { slug: string; avoir: AvoirAValider; onFait: (l: AvoirAValider[]) => void; onClose: () => void }) {
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi]);

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

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dav-titre" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="dav-titre">Avoir sur {avoir.reference ?? 'la facture'}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body da-corps">
          <dl className="da-resume">
            <div>
              <dt>Montant annulé</dt>
              <dd>
                <strong>{formatMontant(avoir.montantTtc)} TTC</strong>
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
                le {jjmmaaaa(avoir.demandeLe)}
                {avoir.demandePar ? ` par ${avoir.demandePar}` : ''}
              </dd>
            </div>
          </dl>
          {!avoir.peutDecider && <p className="dmd-note">Vous avez fait cette demande : elle doit être validée par un autre CEO.</p>}
          {refus !== null && (
            <label className="field">
              <span className="field-label">Motif du refus (transmis au demandeur)</span>
              <textarea className="field-input" rows={2} maxLength={300} value={refus} onChange={(e) => setRefus(e.target.value)} />
            </label>
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
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
                  <button type="button" className="btn-primary" disabled={envoi || !refus.trim()} onClick={() => decider(false)}>
                    Confirmer le refus
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
