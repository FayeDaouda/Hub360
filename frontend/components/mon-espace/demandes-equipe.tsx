'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/client-api';
import { getAbsencesAValider, jjmm, LIBELLE_TYPE_ABSENCE, STATUT_ABSENCE, validerFinaleCeo } from '@/lib/demandes';
import type { DemandeAbsence } from '@/lib/types';
import { DecisionN1Formulaire } from '@/components/absences/decision-n1-modal';

type Filtre = 'a_decider' | 'toutes';

// « Mon espace › À valider » (maquette du boss) : les demandes de l'équipe
// dont je suis le N+1 — à décider, ou toutes — et, à droite, les signaux et
// la décision de la demande choisie.
export function DemandesEquipe({ slug, onCompte }: { slug: string; onCompte: (n: number) => void }) {
  const [toutes, setToutes] = useState<DemandeAbsence[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('a_decider');
  const [choisie, setChoisie] = useState<string | null>(null);

  const charger = useCallback(() => {
    getAbsencesAValider(slug, true)
      .then(setToutes)
      .catch(() => setToutes([]));
  }, [slug]);
  useEffect(charger, [charger]);

  // À décider : comme N+1, ou en validation finale (CEO, demandes de la RH).
  const aDecider = (toutes ?? []).filter((d) => d.statut === 'attente_n1' || d.validationFinale);
  useEffect(() => {
    if (toutes) onCompte(aDecider.length);
  }, [toutes, aDecider.length, onCompte]);

  const visibles = filtre === 'a_decider' ? aDecider : toutes ?? [];
  const demande = (toutes ?? []).find((d) => d.id === choisie) ?? null;

  return (
    <div className="me-colonnes">
      <section className="panel glass-panel dmd-section">
        <h2 className="dmd-titre">Demandes de mon équipe (N+1)</h2>
        <div className="vue-toggle" role="group" aria-label="Filtrer les demandes">
          {(
            [
              ['a_decider', 'À décider', aDecider.length],
              ['toutes', 'Toutes', toutes?.length ?? 0],
            ] as const
          ).map(([cle, libelle, n]) => (
            <button key={cle} type="button" className={filtre === cle ? 'is-active' : ''} aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
              {libelle} · {n}
            </button>
          ))}
        </div>
        {!toutes ? (
          <p className="dmd-note">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="dmd-note">Aucune demande.</p>
        ) : (
          <ul className="dmd-liste">
            {visibles.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`me-demande${d.id === choisie ? ' is-actif' : ''}`}
                  aria-pressed={d.id === choisie}
                  onClick={() => setChoisie(d.id)}
                >
                  <span>
                    <strong>{d.salarie ? `${d.salarie.prenom} ${d.salarie.nom}` : '—'}</strong>
                    <span className="cell-sub">
                      {LIBELLE_TYPE_ABSENCE[d.type]} · {d.jours} j · {jjmm(d.dateDebut)} → {jjmm(d.dateFin)}
                    </span>
                  </span>
                  <span className={`pill ${STATUT_ABSENCE[d.statut].pill}`}>{STATUT_ABSENCE[d.statut].libelle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel glass-panel dmd-section me-decision">
        {!demande ? (
          <p className="dmd-note">Sélectionnez une demande pour voir les signaux et décider.</p>
        ) : demande.validationFinale ? (
          <ValidationFinale
            key={demande.id}
            slug={slug}
            demande={demande}
            onFait={() => {
              setChoisie(null);
              charger();
            }}
          />
        ) : demande.statut === 'attente_n1' ? (
          <DecisionN1Formulaire
            key={demande.id}
            slug={slug}
            id={demande.id}
            onFait={() => {
              setChoisie(null);
              charger();
            }}
          />
        ) : (
          <>
            <h2 className="dmd-titre">{demande.salarie ? `${demande.salarie.prenom} ${demande.salarie.nom}` : 'Demande'}</h2>
            <p>
              <strong>{LIBELLE_TYPE_ABSENCE[demande.type]}</strong> · {demande.jours} j ouvrables · du {jjmm(demande.dateDebut)} au{' '}
              {jjmm(demande.dateFin)}
            </p>
            <p className="dmd-note">
              {STATUT_ABSENCE[demande.statut].libelle} : la demande n’attend plus votre décision.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// Validation finale par le CEO d'une demande de la RH (accord du CFO déjà
// donné) : la RH ne valide jamais sa propre demande.
function ValidationFinale({ slug, demande, onFait }: { slug: string; demande: DemandeAbsence; onFait: () => void }) {
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState('');
  const [etat, setEtat] = useState<{ envoi: boolean; erreur: string | null }>({ envoi: false, erreur: null });

  async function trancher(valide: boolean) {
    setEtat({ envoi: true, erreur: null });
    try {
      await validerFinaleCeo(slug, demande.id, valide, valide ? undefined : motif.trim());
      onFait();
    } catch (e) {
      setEtat({ envoi: false, erreur: e instanceof ApiError ? e.message : 'Décision non enregistrée.' });
    }
  }

  return (
    <>
      <h2 className="dmd-titre">{demande.salarie ? `${demande.salarie.prenom} ${demande.salarie.nom}` : 'Demande'}</h2>
      <p>
        <strong>{LIBELLE_TYPE_ABSENCE[demande.type]}</strong> · {demande.jours} j ouvrables · du {jjmm(demande.dateDebut)} au {jjmm(demande.dateFin)}
      </p>
      {demande.commentaire && <p className="dmd-note">« {demande.commentaire} »</p>}
      <p className="dmd-note">
        Demande de la RH, accord de son N+1 (CFO) donné : la validation finale vous revient — la RH ne valide jamais sa propre demande.
      </p>
      {refus && (
        <label className="field">
          <span className="field-label">Motif du refus</span>
          <textarea className="field-input" rows={2} maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>
      )}
      {etat.erreur && <p className="field-erreur">{etat.erreur}</p>}
      <div className="dmd-actions">
        {refus ? (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => setRefus(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi || !motif.trim()} onClick={() => trancher(false)}>
              Refuser
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost btn-ghost--sm" disabled={etat.envoi} onClick={() => setRefus(true)}>
              Refuser…
            </button>
            <button type="button" className="btn-primary btn-primary--sm" disabled={etat.envoi} onClick={() => trancher(true)}>
              Valider
            </button>
          </>
        )}
      </div>
    </>
  );
}
