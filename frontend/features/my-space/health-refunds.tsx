'use client';

import { useState, type FormEvent } from 'react';
import { formatAmount, formatDate } from '@hub/domain';
import { deposerRemboursement, LIBELLE_SOINS, STATUT_REMBOURSEMENT } from '@/lib/demandes';
import type { CategorieSoins } from '@/lib/types';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/ui/feedback';
import { Field, FieldError } from '@/components/ui/field';
import {
  AttachmentBox,
  errorMessage,
  Loading,
  maskDayInput,
  parseDayInput,
  useMyRequests,
  type Attachment,
} from './request-parts';

// « Mon espace » · Remboursements santé (RH lot 2, maquette du boss) :
// soumise → transmise → remboursée / rejetée, sans aucune donnée médicale.
export function HealthRefunds({ slug }: { slug: string }) {
  const { data, error, load } = useMyRequests(slug);
  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) return <Loading />;
  const { remboursements: refunds } = data;

  return (
    <div className="me-colonnes me-colonnes--egales">
      <RefundForm slug={slug} onDone={load} />
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Mes demandes de remboursement</h2>
        {refunds.length === 0 ? (
          <p className="dmd-note">Aucune demande.</p>
        ) : (
          <ul className="dmd-liste">
            {refunds.map((r) => (
              <li key={r.id} className="dmd-ligne">
                <span>
                  <strong>
                    {LIBELLE_SOINS[r.categorie]} · {formatAmount(r.montant)}
                  </strong>
                  <span className="cell-sub">
                    Soins du {formatDate(r.dateSoins)}
                    {r.montantRembourse != null && ` · remboursé ${formatAmount(r.montantRembourse)}`}
                    {r.motifRejet && ` · ${r.motifRejet}`}
                  </span>
                </span>
                <Pill className={STATUT_REMBOURSEMENT[r.statut].pill}>{STATUT_REMBOURSEMENT[r.statut].libelle}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RefundForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [category, setCategory] = useState<CategorieSoins>('consultation');
  const [beneficiary, setBeneficiary] = useState('moi');
  const [careDate, setCareDate] = useState('');
  const [amount, setAmount] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });
  const isoCare = parseDayInput(careDate);
  const sum = Number(amount.replace(/\s/g, ''));
  const ready = !!isoCare && Number.isInteger(sum) && sum > 0 && files.length > 0;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!isoCare) return;
    setState({ sending: true, error: null });
    try {
      await deposerRemboursement(slug, {
        categorie: category,
        beneficiaire: beneficiary,
        dateSoins: isoCare,
        montant: sum,
        justificatifs: files,
      });
      setCareDate('');
      setAmount('');
      setFiles([]);
      setState({ sending: false, error: null });
      onDone();
    } catch (err) {
      setState({ sending: false, error: errorMessage(err, 'Demande non envoyée.') });
    }
  }

  return (
    <form className="panel glass-panel dmd-section" onSubmit={send}>
      <h2 className="dmd-titre">Demander un remboursement santé</h2>
      <p className="dmd-note">
        Frais médicaux avancés par vous ou vos ayants droit, transmis par la RH à l’assurance (IPM ou assureur). Aucun
        diagnostic n’est demandé ; la demande n’est visible que par vous et la RH.
      </p>
      <div className="rh-grille">
        <Field label="Date des soins">
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="JJ/MM/AAAA"
            value={careDate}
            onChange={(e) => setCareDate(maskDayInput(e.target.value))}
          />
        </Field>
        <Field label="Bénéficiaire">
          <select className="field-input" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)}>
            <option value="moi">Moi</option>
            <option value="conjoint">Conjoint(e)</option>
            <option value="enfant">Enfant</option>
          </select>
        </Field>
        <Field label="Nature des frais">
          <select
            className="field-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategorieSoins)}
          >
            {Object.entries(LIBELLE_SOINS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Montant payé (FCFA)">
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="ex. 25000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <AttachmentBox
        label="Facture et ordonnance jointes (obligatoire)"
        multiple
        files={files}
        onChange={setFiles}
        onError={(m) => setState({ sending: false, error: m })}
      />
      {state.error && <FieldError>{state.error}</FieldError>}
      <button type="submit" className="btn-primary me-envoyer" disabled={state.sending || !ready}>
        {state.sending ? 'Envoi…' : 'Envoyer à la RH'}
      </button>
      <p className="dmd-note me-pied">
        Suivi : soumise → transmise à l’assurance → remboursée (montant crédité sur votre moyen de paiement enregistré).
      </p>
    </form>
  );
}
