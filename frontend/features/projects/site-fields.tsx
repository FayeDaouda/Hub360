'use client';

import { useState } from 'react';
import { FieldError } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { formatDayMonth } from '@hub/domain';
import { setSiteStatus, setSiteVisitDate } from './api';
import { SITE_STATUS_LABELS } from './labels';
import type { SiteStatus } from './types';

export type SiteVisitProps = {
  slug: string;
  projectId: string;
  date: string | null;
  editable: boolean;
  onUpdate: () => Promise<void>;
};

// Date de visite sur site (carte « Relevés existants ») : une fois saisie, les
// relevés sont dus le lendemain (24 h calendaires) et entrent dans le suivi
// des délais.
export function SiteVisitDate({ slug, projectId, date, editable, onUpdate }: SiteVisitProps) {
  const [error, setError] = useState<string | null>(null);
  async function change(value: string) {
    setError(null);
    try {
      await setSiteVisitDate(slug, projectId, value || null);
      await onUpdate();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Date non enregistrée.');
    }
  }
  return (
    <div className="po-visite">
      {editable ? (
        <label className="po-visite-champ">
          <span>Date de visite sur site</span>
          <input type="date" className="field-input" value={date ?? ''} onChange={(e) => change(e.target.value)} />
        </label>
      ) : (
        <p className="po-aide">Visite sur site : {date ? formatDayMonth(date) : 'date non renseignée'}</p>
      )}
      {!date && <p className="po-aide">Sans date de visite, ces relevés n’ont pas d’échéance.</p>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// Statut simple « En conception / En chantier / Livré » (14/10/2026) : posé
// par qui modifie les projets (DPLG, CTO) ; la facturation SU/EX s'y fie.
export function SiteStatusField({
  slug,
  projectId,
  status,
  editable,
  onUpdate,
}: {
  slug: string;
  projectId: string;
  status: SiteStatus;
  editable: boolean;
  onUpdate: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!editable)
    return (
      <Pill tone="neutre" className="po-statut-chantier">
        {SITE_STATUS_LABELS[status]}
      </Pill>
    );
  return (
    <label className="po-statut-chantier">
      <span className="po-aide">Statut</span>
      <select
        className="field-input"
        value={status}
        onChange={async (e) => {
          setError(null);
          try {
            await setSiteStatus(slug, projectId, e.target.value as SiteStatus);
            await onUpdate();
          } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Statut non enregistré.');
          }
        }}
      >
        {(Object.keys(SITE_STATUS_LABELS) as SiteStatus[]).map((k) => (
          <option key={k} value={k}>
            {SITE_STATUS_LABELS[k]}
          </option>
        ))}
      </select>
      {error && <span className="field-erreur">{error}</span>}
    </label>
  );
}
