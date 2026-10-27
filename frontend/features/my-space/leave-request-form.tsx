'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { deposerAbsence, getSuppleants, LIBELLE_TYPE_ABSENCE, type Suppleant } from '@/lib/demandes';
import type { SoldeConges, TypeAbsence } from '@/lib/types';
import { Field, FieldError } from '@/components/ui/field';
import { AttachmentBox, errorMessage, maskDayInput, parseDayInput, type Attachment } from './request-parts';

// Demande d'absence ou de congé : envoyée au N+1, puis à la RH.
export function LeaveRequestForm({
  slug,
  balance,
  onDone,
}: {
  slug: string;
  balance: SoldeConges;
  onDone: () => void;
}) {
  const [type, setType] = useState<TypeAbsence>('conge_paye');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [motif, setMotif] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });
  // Dir. GC (revue du 21/10/2026) : qui tient sa place pendant l'absence.
  const [deputies, setDeputies] = useState<Suppleant[]>([]);
  const [deputyId, setDeputyId] = useState('');
  useEffect(() => {
    getSuppleants(slug)
      .then(setDeputies)
      .catch(() => setDeputies([]));
  }, [slug]);
  const isoStart = parseDayInput(start);
  const isoEnd = parseDayInput(end);
  const motifRequired = type !== 'conge_paye';
  const ready = !!isoStart && !!isoEnd && (!motifRequired || !!motif.trim());

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!isoStart || !isoEnd) return;
    setState({ sending: true, error: null });
    try {
      await deposerAbsence(slug, {
        type,
        dateDebut: isoStart,
        dateFin: isoEnd,
        commentaire: motif.trim() || undefined,
        justificatif: files[0],
        suppleantId: deputyId || undefined,
      });
      setStart('');
      setEnd('');
      setMotif('');
      setFiles([]);
      setState({ sending: false, error: null });
      onDone();
    } catch (err) {
      setState({ sending: false, error: errorMessage(err, 'Demande non envoyée.') });
    }
  }

  return (
    <form className="panel glass-panel dmd-section" onSubmit={send}>
      <h2 className="dmd-titre">Demander une absence ou un congé</h2>
      <p className="dmd-note">
        Restant : <strong>{balance.disponible} j</strong>
        {balance.enAttente > 0 && ` (dont ${balance.enAttente} j en attente de décision, réservés)`}. Décompte hors
        dimanches et jours fériés des Réglages.
      </p>
      <Field label="Type">
        <select className="field-input" value={type} onChange={(e) => setType(e.target.value as TypeAbsence)}>
          {Object.entries(LIBELLE_TYPE_ABSENCE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <div className="rh-grille">
        <Field label="Du">
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="JJ/MM/AAAA"
            value={start}
            onChange={(e) => setStart(maskDayInput(e.target.value))}
          />
        </Field>
        <Field label="Au (inclus)">
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="JJ/MM/AAAA"
            value={end}
            onChange={(e) => setEnd(maskDayInput(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Motif">
        <textarea
          className="field-input"
          rows={2}
          maxLength={1000}
          placeholder={motifRequired ? 'Obligatoire pour ce type d’absence' : 'Facultatif pour un congé payé'}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
      </Field>
      <AttachmentBox
        label="Justificatif joint"
        files={files}
        onChange={setFiles}
        onError={(m) => setState({ sending: false, error: m })}
      />
      {deputies.length > 0 && (
        <Field label="Suppléant pendant votre absence">
          <select className="field-input" value={deputyId} onChange={(e) => setDeputyId(e.target.value)}>
            <option value="">Le CTO (par défaut)</option>
            {deputies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} · {s.role.replace(/\s*\(transverse\)$/, '')}
              </option>
            ))}
          </select>
          <span className="cell-sub">
            Remises, prolongations et TS lui reviennent tant que votre absence validée dure ; il est prévenu dès
            l’envoi.
          </span>
        </Field>
      )}
      {/* Seulement une date complète mais invalide (pas avant toute saisie). */}
      {((start.length === 10 && !isoStart) || (end.length === 10 && !isoEnd)) && (
        <p className="me-consigne">Date invalide : JJ/MM/AAAA.</p>
      )}
      {state.error && <FieldError>{state.error}</FieldError>}
      <button type="submit" className="btn-primary me-envoyer" disabled={state.sending || !ready}>
        {state.sending ? 'Envoi…' : 'Envoyer à mon N+1'}
      </button>
      <p className="dmd-note me-pied">
        Circuit : vous → votre N+1 (décision) → RH Holding (validation finale et paie).
      </p>
    </form>
  );
}
