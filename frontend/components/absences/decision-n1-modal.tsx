'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { CalendrierCellule } from './calendrier-cellule';
import {
  deciderAbsence,
  getPreparationDecision,
  jjmm,
  LIBELLE_MOTIF_REFUS,
  LIBELLE_TYPE_ABSENCE,
} from '@/lib/demandes';
import type { DecisionN1, MotifRefusAbsence, PreparationDecision } from '@/lib/types';

const DECISIONS: { cle: DecisionN1; libelle: string; aide: string }[] = [
  {
    cle: 'valider',
    libelle: 'Valider',
    aide: 'Chaque tâche de projet due pendant l’absence est confiée à quelqu’un d’autre.',
  },
  {
    cle: 'sous_conditions',
    libelle: 'Sous conditions',
    aide: 'Les tâches cochées comme non délégables restent au salarié, à terminer avant son départ.',
  },
  {
    cle: 'autres_dates',
    libelle: 'Autres dates',
    aide: 'Le salarié accepte les nouvelles dates ou retire sa demande.',
  },
  { cle: 'refuser', libelle: 'Refuser', aide: 'Motif obligatoire (commentaire si « Autre »).' },
];

// Décision du N+1 sur une demande d'absence — partagée entre l'espace
// collaborateur (chef de cellule) et le back-office (Dir. GC) : en modale
// (Équipe), ou dans le panneau de « Mon espace › À valider ».
export function DecisionN1Modal({
  slug,
  id,
  onFait,
  onClose,
}: {
  slug: string;
  id: string;
  onFait: () => void;
  onClose: () => void;
}) {
  // Portail : ouverte depuis un panneau « glass » (backdrop-filter), la modale
  // serait sinon contenue — et rognée — par ce panneau.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal rh-fiche"
        role="dialog"
        aria-modal="true"
        aria-label="Décision N+1"
        onClick={(e) => e.stopPropagation()}
      >
        <DecisionN1Formulaire slug={slug} id={id} onFait={onFait} onAnnuler={onClose} />
      </div>
    </div>,
    document.body,
  );
}

// Signaux (cellule, livrables dus) et décision. `onAnnuler` : bouton de
// fermeture (modale) ; absent dans un panneau.
export function DecisionN1Formulaire({
  slug,
  id,
  onFait,
  onAnnuler,
}: {
  slug: string;
  id: string;
  onFait: () => void;
  onAnnuler?: () => void;
}) {
  const [prep, setPrep] = useState<PreparationDecision | null>(null);
  const [decision, setDecision] = useState<DecisionN1>('valider');
  const [delegations, setDelegations] = useState<Record<string, string>>({});
  const [nonDelegables, setNonDelegables] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState({ debut: '', fin: '' });
  const [motif, setMotif] = useState<MotifRefusAbsence | ''>('');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    getPreparationDecision(slug, id)
      .then((p) => {
        setPrep(p);
        if (p.alerteCellule.preselection) setDecision('autres_dates');
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible.'));
  }, [slug, id]);

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await deciderAbsence(slug, id, {
        decision,
        delegations: Object.entries(delegations)
          .filter(([cle]) => !nonDelegables.has(cle))
          .map(([livrable, collaborateurId]) => ({ livrable, collaborateurId })),
        nonDelegables: [...nonDelegables],
        dateDebut: dates.debut || undefined,
        dateFin: dates.fin || undefined,
        motif: motif || undefined,
        commentaire: commentaire || undefined,
      });
      onFait();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Décision non enregistrée.');
    } finally {
      setEnvoi(false);
    }
  }

  const d = prep?.demande;
  const avecLivrables = decision === 'valider' || decision === 'sous_conditions';
  return (
    <>
      <header className="modal-header">
        <div>
          <span className="cell-sub">Demande d’absence · décision du N+1</span>
          <h2>{d?.salarie ? `${d.salarie.prenom} ${d.salarie.nom}` : 'Demande'}</h2>
        </div>
        {onAnnuler && (
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onAnnuler}>
            <X size={18} />
          </button>
        )}
      </header>
      <div className="modal-body">
        {!prep ? (
          <p className="dmd-note">{erreur ?? 'Chargement…'}</p>
        ) : (
          <>
            <p>
              <strong>{LIBELLE_TYPE_ABSENCE[d!.type]}</strong> · {d!.jours} j ouvrables · du {jjmm(d!.dateDebut)} au{' '}
              {jjmm(d!.dateFin)}
              {d!.commentaire && <span className="cell-sub"> — « {d!.commentaire} »</span>}
            </p>
            {/* Qui d'autre de la cellule est absent ces jours-là (calendrier). */}
            <CalendrierCellule slug={slug} demandeId={id} source="decideur" />

            <div className="vue-toggle rh-decisions" role="radiogroup" aria-label="Décision">
              {DECISIONS.map((x) => (
                <button
                  key={x.cle}
                  type="button"
                  role="radio"
                  aria-checked={decision === x.cle}
                  className={decision === x.cle ? 'is-active' : ''}
                  onClick={() => setDecision(x.cle)}
                >
                  {x.libelle}
                </button>
              ))}
            </div>
            <p className="dmd-note">{DECISIONS.find((x) => x.cle === decision)!.aide}</p>

            {avecLivrables &&
              (prep.livrables.length === 0 ? (
                <p className="dmd-note">Aucune tâche de projet due pendant l’absence.</p>
              ) : (
                <ul className="rh-pieces">
                  {prep.livrables.map((l) => (
                    <li key={l.cle} className="rh-piece rh-livrable">
                      <span className="rh-piece-libelle">
                        <strong>
                          {l.projet} · {l.groupe.replace(/_/g, ' ')}
                        </strong>
                        <span className="cell-sub">
                          {l.source} · échéance {jjmm(l.echeance)}
                        </span>
                      </span>
                      {decision === 'sous_conditions' && (
                        <label className="rh-archives">
                          <input
                            type="checkbox"
                            checked={nonDelegables.has(l.cle)}
                            onChange={(e) =>
                              setNonDelegables((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(l.cle);
                                else n.delete(l.cle);
                                return n;
                              })
                            }
                          />
                          Non délégable
                        </label>
                      )}
                      {!nonDelegables.has(l.cle) && (
                        <select
                          className="field-input"
                          value={delegations[l.cle] ?? ''}
                          onChange={(e) => setDelegations((x) => ({ ...x, [l.cle]: e.target.value }))}
                          aria-label="Confier à"
                        >
                          <option value="">Confier à…</option>
                          {prep.candidats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.libelle}
                              {c.cellule ? ` · ${c.cellule}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              ))}

            {decision === 'autres_dates' && (
              <div className="rh-grille">
                <label className="field">
                  <span className="field-label">Nouveau début</span>
                  <input
                    type="date"
                    className="field-input"
                    value={dates.debut}
                    onChange={(e) => setDates((x) => ({ ...x, debut: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Nouvelle fin</span>
                  <input
                    type="date"
                    className="field-input"
                    value={dates.fin}
                    onChange={(e) => setDates((x) => ({ ...x, fin: e.target.value }))}
                  />
                </label>
              </div>
            )}

            {decision === 'refuser' && (
              <label className="field">
                <span className="field-label">Motif</span>
                <select
                  className="field-input"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value as MotifRefusAbsence)}
                >
                  <option value="">À choisir</option>
                  {Object.entries(LIBELLE_MOTIF_REFUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(decision === 'refuser' || decision === 'autres_dates') && (
              <label className="field">
                <span className="field-label">
                  Commentaire{decision === 'refuser' && motif === 'autre' ? ' (obligatoire)' : ''}
                </span>
                <textarea
                  className="field-input"
                  rows={2}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </label>
            )}

            {erreur && <p className="field-erreur">{erreur}</p>}
            <div className="modal-actions">
              {onAnnuler && (
                <button type="button" className="btn-ghost" onClick={onAnnuler}>
                  Annuler
                </button>
              )}
              <button type="button" className="btn-primary" onClick={envoyer} disabled={envoi}>
                {envoi ? 'Envoi…' : 'Enregistrer la décision'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
