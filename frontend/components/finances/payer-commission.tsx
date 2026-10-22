'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { LIBELLES_COORDONNEES, payerCommission, type CommissionApporteur, type CoordonneesApporteur } from '@/lib/commissions';
import { formatMontant, formatNombre } from '@/lib/format';
import { MODES_PAIEMENT, type ModePaiement } from '@/lib/types';

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Le CFO règle la commission d'un apporteur (revue COO, 22/10/2026) : date,
// mode et référence ; les coordonnées saisies par le COO sont rappelées.
export function PayerCommission({ slug, commission: c, onFait, onClose }: { slug: string; commission: CommissionApporteur; onFait: () => void; onClose: () => void }) {
  const [date, setDate] = useState(aujourdhui());
  const [mode, setMode] = useState<ModePaiement>('virement');
  const [reference, setReference] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose, envoi]);

  async function payer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await payerCommission(slug, c.id, { date, mode, ...(reference.trim() ? { reference: reference.trim() } : {}) });
      onFait();
      onClose();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le paiement n’a pas été enregistré.');
      setEnvoi(false);
    }
  }

  const coordonnees = c.coordonnees ? (Object.keys(LIBELLES_COORDONNEES) as (keyof CoordonneesApporteur)[]).filter((k) => c.coordonnees![k]) : [];

  return createPortal(
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pc-titre" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="pc-titre">Commission · {c.apporteur}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" disabled={envoi} onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="modal-body da-corps">
          <dl className="da-resume">
            <div>
              <dt>Montant</dt>
              <dd>
                <strong>{formatMontant(c.montant)}</strong>
              </dd>
            </div>
            <div>
              <dt>Calcul</dt>
              <dd>
                {formatNombre(c.taux)} % de {formatMontant(c.baseHt)} HT {c.source === 'encaissement' ? 'encaissés' : 'du contrat signé'}
              </dd>
            </div>
            <div>
              <dt>Dossier</dt>
              <dd>
                {c.code} · {c.client}
              </dd>
            </div>
            <div>
              <dt>Exigible</dt>
              <dd>le {jjmmaaaa(c.exigibleLe)}</dd>
            </div>
            <div>
              <dt>Coordonnées</dt>
              <dd>
                {coordonnees.length ? (
                  coordonnees.map((k) => (
                    <span key={k} className="pc-coordonnee">
                      {LIBELLES_COORDONNEES[k]} : {c.coordonnees![k]}
                    </span>
                  ))
                ) : (
                  <span className="cell-sub">non renseignées par le COO</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="pc-champs">
            <label className="field">
              <span className="field-label">Payée le</span>
              <input className="field-input" type="date" value={date} max={aujourdhui()} disabled={envoi} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Mode</span>
              <select className="field-input" value={mode} disabled={envoi} onChange={(e) => setMode(e.target.value as ModePaiement)}>
                {(Object.keys(MODES_PAIEMENT) as ModePaiement[]).map((m) => (
                  <option key={m} value={m}>
                    {MODES_PAIEMENT[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Référence (facultatif)</span>
              <input className="field-input" maxLength={120} value={reference} disabled={envoi} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" disabled={envoi} onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" disabled={envoi || !date} onClick={payer}>
              {envoi ? 'Enregistrement…' : 'Marquer payée'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
