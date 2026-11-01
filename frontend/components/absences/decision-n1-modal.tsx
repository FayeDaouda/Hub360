'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, Hourglass, Plane } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { CalendrierCellule } from './calendrier-cellule';
import { deciderAbsence, getPreparationDecision, LIBELLE_MOTIF_REFUS, LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import type { DecisionN1, MotifRefusAbsence, PreparationDecision, SoldeConges } from '@/lib/types';
import { formatDate } from '@hub/domain';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { KpiStrip } from '@/components/ui/kpi';

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
  return (
    <Modal onClose={onClose} closeOnEscape={false} portal className="rh-fiche" label="Décision N+1">
      <DecisionN1Formulaire slug={slug} id={id} onFait={onFait} onAnnuler={onClose} />
    </Modal>
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
        {onAnnuler && <CloseButton onClick={onAnnuler} />}
      </header>
      <div className="modal-body">
        {!prep ? (
          <p className="dmd-note">{erreur ?? 'Chargement…'}</p>
        ) : (
          <>
            <p>
              <strong>{LIBELLE_TYPE_ABSENCE[d!.type]}</strong> · {d!.jours} j ouvrables · du {formatDate(d!.dateDebut)}{' '}
              au {formatDate(d!.dateFin)}
              {d!.commentaire && <span className="cell-sub"> — « {d!.commentaire} »</span>}
            </p>
            {prep.solde && <SoldeDemandeur solde={prep.solde} />}
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
                          {l.source} · échéance {formatDate(l.echeance)}
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
                <Field label="Nouveau début">
                  <input
                    type="date"
                    className="field-input"
                    value={dates.debut}
                    onChange={(e) => setDates((x) => ({ ...x, debut: e.target.value }))}
                  />
                </Field>
                <Field label="Nouvelle fin">
                  <input
                    type="date"
                    className="field-input"
                    value={dates.fin}
                    onChange={(e) => setDates((x) => ({ ...x, fin: e.target.value }))}
                  />
                </Field>
              </div>
            )}

            {decision === 'refuser' && (
              <Field label="Motif">
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
              </Field>
            )}
            {(decision === 'refuser' || decision === 'autres_dates') && (
              <Field label={<>Commentaire{decision === 'refuser' && motif === 'autre' ? ' (obligatoire)' : ''}</>}>
                <textarea
                  className="field-input"
                  rows={2}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </Field>
            )}

            {erreur && <FieldError>{erreur}</FieldError>}
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

// Jours restants du demandeur, comme il les voit dans Mon espace : la demande
// en cours est déjà déduite (« en attente »).
function SoldeDemandeur({ solde }: { solde: SoldeConges }) {
  return (
    <KpiStrip
      compact
      tiles={[
        {
          id: 'restant',
          label: 'Restant',
          value: `${solde.disponible} j`,
          hint: solde.enAttente
            ? `${solde.enAttente} j en attente déjà déduits, cette demande comprise`
            : 'à poser cette année',
          icon: Plane,
          state: solde.disponible < 0 ? 'risque' : undefined,
        },
        {
          id: 'acquis',
          label: `Acquis ${solde.annee}`,
          value: `${solde.acquis} j`,
          hint: '2 jours ouvrables par mois de service',
          icon: CalendarPlus,
        },
        {
          id: 'report',
          label: `Report de ${solde.annee - 1}`,
          value: `${solde.report} j`,
          hint: solde.plafondReport ? `plafonné à ${solde.plafondReport} j` : 'aucun report',
          icon: Hourglass,
        },
        { id: 'pris', label: 'Pris', value: `${solde.pris} j`, hint: 'congés payés validés', icon: CalendarCheck },
      ]}
    />
  );
}
