'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { LIBELLE_CONTRAT } from '@/lib/rh';
import { formatDate } from '@hub/domain';
import { Field, FieldError } from '@/components/ui/field';
import { requestPaymentChange, updateContactDetails } from './api';
import { PAYMENT_MODE_LABELS } from './constants';
import type { ContactDetails, MyFile, PaymentMode } from './types';

type FamilyStatus = NonNullable<MyFile['situationFamiliale']>;

const orDash = (v: string) => v.trim() || '—';
// Pièce d'identité masquée (maquette : « •••• 2211 »).
const masked = (n: string) => (n.trim() ? `•••• ${n.trim().slice(-4)}` : '—');

const FAMILY_STATUSES: Record<FamilyStatus, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / veuve',
};

type TextField = 'telephone' | 'emailPerso' | 'adresse' | 'contactUrgence' | 'telephoneUrgence';

// « Mon espace » · Mes informations (maquette du boss) : à gauche, ce que gère
// la RH (lecture) ; à droite, ce que le salarié modifie lui-même, enregistré
// immédiatement — sauf le moyen de paiement, soumis à la RH qui le valide
// avant la paie. Le salaire n'y figure pas.
export function PersonalInfo({ slug, file, onChange }: { slug: string; file: MyFile; onChange: (f: MyFile) => void }) {
  const [entries, setEntries] = useState<Partial<Record<TextField, string>>>({});
  const [mode, setMode] = useState<PaymentMode>(file.paiementDemande?.mode ?? file.modePaiement);
  const [details, setDetails] = useState(file.paiementDemande?.coordonnees ?? file.coordonneesPaiement);
  const [state, setState] = useState<{ sending: boolean; error: string | null; saved: boolean }>({
    sending: false,
    error: null,
    saved: false,
  });

  async function save(fields: ContactDetails) {
    setState({ sending: true, error: null, saved: false });
    try {
      const r = await updateContactDetails(slug, fields);
      if (r.dossier) onChange(r.dossier);
      setState({ sending: false, error: null, saved: true });
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Non enregistré.', saved: false });
    }
  }

  // Champ texte : enregistré à la sortie du champ, s'il a changé.
  const text = (field: TextField, label: string, o: { type?: string; long?: boolean } = {}) => {
    const value = entries[field] ?? file[field];
    const props = {
      id: `mi-${field}`,
      className: 'field-input',
      value,
      onChange: (e: { target: { value: string } }) => setEntries((s) => ({ ...s, [field]: e.target.value })),
      onBlur: () => {
        if (entries[field] !== undefined && entries[field]!.trim() !== file[field])
          void save({ [field]: entries[field] });
      },
    };
    return (
      <Field label={label} htmlFor={props.id}>
        {o.long ? <textarea {...props} rows={2} maxLength={300} /> : <input {...props} type={o.type ?? 'text'} />}
      </Field>
    );
  };

  async function submitPayment() {
    setState({ sending: true, error: null, saved: false });
    try {
      const r = await requestPaymentChange(slug, { modePaiement: mode, coordonneesPaiement: details });
      if (r.dossier) onChange(r.dossier);
      setState({ sending: false, error: null, saved: false });
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Demande non envoyée.', saved: false });
    }
  }

  const pending = file.paiementDemande;
  const reference = pending ?? { mode: file.modePaiement, coordonnees: file.coordonneesPaiement };
  const paymentChanged = mode !== reference.mode || details.trim() !== reference.coordonnees;

  const hrFields: [string, string][] = [
    ['Matricule', file.matricule],
    ['Société', file.societe],
    ['Poste', orDash(file.poste)],
    ['Cellule', file.cellule ?? 'sans cellule'],
    ['Contrat', LIBELLE_CONTRAT[file.typeContrat]],
    ['Date d’entrée', formatDate(file.dateEntree)],
    ['Date de naissance', formatDate(file.dateNaissance)],
    ['Pièce d’identité', masked(file.numeroPiece)],
    ['N° IPM / assurance', orDash(file.numeroIpm)],
    ['E-mail professionnel', orDash(file.emailPro)],
  ];

  return (
    <div className="me-colonnes me-colonnes--egales">
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Gérées par la RH</h2>
        <p className="dmd-note">Une erreur ? Signalez-la à la RH, elle corrige le dossier.</p>
        <dl className="me-lignes">
          {hrFields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes informations</h2>
        <p className="dmd-note">
          Enregistrées immédiatement. Le changement de moyen de paiement est validé par la RH avant la paie.
          {state.saved && <span className="me-ok"> Enregistré.</span>}
        </p>
        <div className="rh-grille">
          {text('telephone', 'Téléphone', { type: 'tel' })}
          {text('emailPerso', 'E-mail personnel', { type: 'email' })}
          <Field label="Situation familiale">
            <select
              className="field-input"
              value={file.situationFamiliale ?? ''}
              disabled={state.sending}
              onChange={(e) => save({ situationFamiliale: (e.target.value || null) as FamilyStatus | null })}
            >
              <option value="">Non renseignée</option>
              {Object.entries(FAMILY_STATUSES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Enfants à charge">
            <input
              className="field-input"
              type="number"
              min={0}
              max={30}
              defaultValue={file.enfantsACharge}
              key={file.enfantsACharge}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 30 && n !== file.enfantsACharge)
                  void save({ enfantsACharge: n });
              }}
            />
          </Field>
        </div>
        {text('adresse', 'Adresse', { long: true })}
        <div className="rh-grille">
          {text('contactUrgence', 'Contact d’urgence')}
          {text('telephoneUrgence', 'Téléphone d’urgence', { type: 'tel' })}
        </div>

        <p className="me-intertitre">Moyen de paiement du salaire</p>
        <div className="rh-grille">
          <Field label="Mode">
            <select className="field-input" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {Object.entries(PAYMENT_MODE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Banque et RIB, ou numéro">
            <input
              className="field-input"
              maxLength={80}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </Field>
        </div>
        <div className="me-paiement">
          <button
            type="button"
            className="btn-ghost"
            disabled={state.sending || !paymentChanged || !details.trim()}
            onClick={submitPayment}
          >
            Soumettre à la RH
          </button>
          {pending ? (
            <span className="me-attente">
              En attente de la RH · {PAYMENT_MODE_LABELS[pending.mode]} (soumis le {formatDate(pending.le)})
            </span>
          ) : (
            <span className="me-ok">À jour · {PAYMENT_MODE_LABELS[file.modePaiement]}</span>
          )}
        </div>
        {state.error && <FieldError>{state.error}</FieldError>}
      </section>
    </div>
  );
}
