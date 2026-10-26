'use client';

import { useState } from 'react';
import {
  LIBELLES_COORDONNEES,
  payerCommission,
  type CommissionApporteur,
  type CoordonneesApporteur,
} from '@/lib/commissions';
import { formatAmount, formatNumber } from '@/lib/format';
import { MODES_PAIEMENT, type ModePaiement } from '@/lib/types';
import { formatDate, todayIso } from '@/lib/dates';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';

// Le CFO règle la commission d'un apporteur (revue COO, 22/10/2026) : date,
// mode et référence ; les coordonnées saisies par le COO sont rappelées.
export function PayerCommission({
  slug,
  commission: c,
  onFait,
  onClose,
}: {
  slug: string;
  commission: CommissionApporteur;
  onFait: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<ModePaiement>('virement');
  const [reference, setReference] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

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

  const coordonnees = c.coordonnees
    ? (Object.keys(LIBELLES_COORDONNEES) as (keyof CoordonneesApporteur)[]).filter((k) => c.coordonnees![k])
    : [];

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="pc-titre">
      <header className="modal-header">
        <h2 id="pc-titre">Commission · {c.apporteur}</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body da-corps">
        <dl className="da-resume">
          <div>
            <dt>Montant</dt>
            <dd>
              <strong>{formatAmount(c.montant)}</strong>
            </dd>
          </div>
          <div>
            <dt>Calcul</dt>
            <dd>
              {formatNumber(c.taux)} % de {formatAmount(c.baseHt)} HT{' '}
              {c.source === 'encaissement' ? 'encaissés' : 'du contrat signé'}
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
            <dd>le {formatDate(c.exigibleLe)}</dd>
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
          <Field label="Payée le">
            <input
              className="field-input"
              type="date"
              value={date}
              max={todayIso()}
              disabled={envoi}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Mode">
            <select
              className="field-input"
              value={mode}
              disabled={envoi}
              onChange={(e) => setMode(e.target.value as ModePaiement)}
            >
              {(Object.keys(MODES_PAIEMENT) as ModePaiement[]).map((m) => (
                <option key={m} value={m}>
                  {MODES_PAIEMENT[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Référence (facultatif)">
            <input
              className="field-input"
              maxLength={120}
              value={reference}
              disabled={envoi}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </div>
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" disabled={envoi} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" disabled={envoi || !date} onClick={payer}>
            {envoi ? 'Enregistrement…' : 'Marquer payée'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
