'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider, LIBELLE_TYPE_ABSENCE, STATUT_ABSENCE, validerFinaleCeo } from '@/lib/demandes';
import type { DemandeAbsence } from '@/lib/types';
import { DecisionN1Formulaire } from '@/components/absences/decision-n1-modal';
import { CalendrierCellule } from '@/components/absences/calendrier-cellule';
import { formatDate } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';

type Filter = 'a_decider' | 'toutes';

// « Mon espace › À valider » (maquette du boss) : les demandes de l'équipe
// dont je suis le N+1 — à décider, ou toutes — et, à droite, les signaux et
// la décision de la demande choisie.
export function TeamRequests({ slug, onCount }: { slug: string; onCount: (n: number) => void }) {
  const [all, setAll] = useState<DemandeAbsence[] | null>(null);
  const [filter, setFilter] = useState<Filter>('a_decider');
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(() => {
    getAbsencesAValider(slug, true)
      .then(setAll)
      .catch(() => setAll([]));
  }, [slug]);
  useEffect(load, [load]);

  // À décider : comme N+1, ou en validation finale (CEO, demandes de la RH).
  const toDecide = (all ?? []).filter((d) => d.statut === 'attente_n1' || d.validationFinale);
  useEffect(() => {
    if (all) onCount(toDecide.length);
  }, [all, toDecide.length, onCount]);

  const shown = filter === 'a_decider' ? toDecide : (all ?? []);
  const request = (all ?? []).find((d) => d.id === chosen) ?? null;
  const done = () => {
    setChosen(null);
    load();
  };

  return (
    <div className="me-colonnes">
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Demandes de mon équipe (N+1)</h2>
        <div className="vue-toggle" role="group" aria-label="Filtrer les demandes">
          {(
            [
              ['a_decider', 'À décider', toDecide.length],
              ['toutes', 'Toutes', all?.length ?? 0],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'is-active' : ''}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} · {n}
            </button>
          ))}
        </div>
        {!all ? (
          <p className="dmd-note">Chargement…</p>
        ) : shown.length === 0 ? (
          <p className="dmd-note">Aucune demande.</p>
        ) : (
          <ul className="dmd-liste">
            {shown.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`me-demande${d.id === chosen ? ' is-actif' : ''}`}
                  aria-pressed={d.id === chosen}
                  onClick={() => setChosen(d.id)}
                >
                  <span>
                    <strong>{d.salarie ? `${d.salarie.prenom} ${d.salarie.nom}` : '—'}</strong>
                    <span className="cell-sub">
                      {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j · {formatDate(d.dateDebut)} → {formatDate(d.dateFin)}
                    </span>
                  </span>
                  <Pill className={STATUT_ABSENCE[d.statut].pill}>{STATUT_ABSENCE[d.statut].libelle}</Pill>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel glass-panel dmd-section me-decision">
        {!request ? (
          <p className="dmd-note">Sélectionnez une demande pour voir les signaux et décider.</p>
        ) : request.validationFinale ? (
          <FinalApproval key={request.id} slug={slug} request={request} onDone={done} />
        ) : request.statut === 'attente_n1' ? (
          <DecisionN1Formulaire key={request.id} slug={slug} id={request.id} onFait={done} />
        ) : (
          <>
            <h2 className="dmd-titre">
              {request.salarie ? `${request.salarie.prenom} ${request.salarie.nom}` : 'Demande'}
            </h2>
            <p>
              <strong>{LIBELLE_TYPE_ABSENCE[request.type]}</strong> · {request.jours} j ouvrables · du{' '}
              {formatDate(request.dateDebut)} au {formatDate(request.dateFin)}
            </p>
            <p className="dmd-note">
              {STATUT_ABSENCE[request.statut].libelle} : la demande n’attend plus votre décision.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// Validation finale par le CEO d'une demande de la RH (accord du CFO déjà
// donné) : la RH ne valide jamais sa propre demande.
function FinalApproval({ slug, request, onDone }: { slug: string; request: DemandeAbsence; onDone: () => void }) {
  const [refusing, setRefusing] = useState(false);
  const [motif, setMotif] = useState('');
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null });

  async function decide(approved: boolean) {
    setState({ sending: true, error: null });
    try {
      await validerFinaleCeo(slug, request.id, approved, approved ? undefined : motif.trim());
      onDone();
    } catch (e) {
      setState({ sending: false, error: e instanceof ApiError ? e.message : 'Décision non enregistrée.' });
    }
  }

  return (
    <>
      <h2 className="dmd-titre">{request.salarie ? `${request.salarie.prenom} ${request.salarie.nom}` : 'Demande'}</h2>
      <p>
        <strong>{LIBELLE_TYPE_ABSENCE[request.type]}</strong> · {request.jours} j ouvrables · du{' '}
        {formatDate(request.dateDebut)} au {formatDate(request.dateFin)}
      </p>
      {request.commentaire && <p className="dmd-note">« {request.commentaire} »</p>}
      <p className="dmd-note">
        Demande de la RH, accord de son N+1 (CFO) donné : la validation finale vous revient — la RH ne valide jamais sa
        propre demande.
      </p>
      <CalendrierCellule slug={slug} demandeId={request.id} source="decideur" />
      {refusing && (
        <Field label="Motif du refus">
          <textarea
            className="field-input"
            rows={2}
            maxLength={1000}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </Field>
      )}
      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="dmd-actions">
        {refusing ? (
          <>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={state.sending}
              onClick={() => setRefusing(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={state.sending || !motif.trim()}
              onClick={() => decide(false)}
            >
              Refuser
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              disabled={state.sending}
              onClick={() => setRefusing(true)}
            >
              Refuser…
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={state.sending}
              onClick={() => decide(true)}
            >
              Valider
            </button>
          </>
        )}
      </div>
    </>
  );
}
