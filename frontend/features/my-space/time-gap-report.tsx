'use client';

import { useState } from 'react';
import { formatDate, formatMonthYear } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { signalerEcartTemps } from '@/lib/temps';
import type { MonTemps } from '@/lib/types';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';

// Écart : signalé tant que la RH n'a pas contrôlé le mois ; un seul ouvert.
export function TimeGapReport({
  slug,
  data,
  onChange,
}: {
  slug: string;
  data: MonTemps;
  onChange: (d: MonTemps) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });
  const { ecart: gap, feuille: sheet } = data;
  const open = !!gap && !gap.traiteLe;
  const reportable = !open && sheet.statut !== 'controlee';

  async function send() {
    setState({ sending: true, error: null });
    try {
      onChange(await signalerEcartTemps(slug, data.mois, entry!));
      setEntry(null);
      setState({ sending: false, error: null });
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Signalement non envoyé.' });
    }
  }

  if (!gap && !reportable) return null;
  return (
    <section className="panel glass-panel dmd-section">
      <h2 className="dmd-titre">Un écart sur cette feuille ?</h2>
      {gap && (
        <div className="temps-ecart">
          <p className="dmd-note">
            <Pill className={open ? 'pill--attention' : 'pill--succes'}>
              {open ? 'Signalé · en attente de la RH' : 'Traité'}
            </Pill>{' '}
            Vous avez signalé le {formatDate(gap.signaleLe)} : « {gap.commentaire} »
          </p>
          {gap.reponse && gap.traiteLe && (
            <p className="dmd-note">
              Réponse de la RH le {formatDate(gap.traiteLe)} : « {gap.reponse} »
            </p>
          )}
        </div>
      )}
      {reportable && entry === null && (
        <div className="mt-decider">
          <p className="dmd-note">
            Absence oubliée, tâche mal datée… Si le calcul vous semble faux, signalez-le : la RH vérifie et corrige si
            besoin. Sans signalement, la feuille est considérée comme juste.
          </p>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEntry('')}>
            Signaler un écart
          </button>
        </div>
      )}
      {entry !== null && (
        <>
          <Field label={<>Ce qui ne va pas · {formatMonthYear(data.mois)}</>}>
            <textarea
              className="field-input"
              rows={3}
              maxLength={1000}
              placeholder="Ex. : absence du 12 au 14 non prise en compte ; la tâche « Plans RDC » a commencé le 20, pas le 6."
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              autoFocus
            />
          </Field>
          {state.error && <FieldError>{state.error}</FieldError>}
          <div className="dmd-actions">
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={state.sending}
              onClick={() => setEntry(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={state.sending || entry.trim().length < 5}
              onClick={send}
            >
              Envoyer à la RH
            </button>
          </div>
        </>
      )}
    </section>
  );
}
