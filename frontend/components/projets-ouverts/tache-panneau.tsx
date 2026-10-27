'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STATUTS_DEVIS } from '@/lib/types';
import {
  assignTask,
  decideExtension,
  decideProjectTask,
  downloadSubmissionPiece,
  getTaskHistory,
  getTaskWorkload,
  requestExtension,
  setTaskVisa,
  submitProjectTask,
} from '@/features/projects/api';
import { stepNumber, taskPill, workloadLabel } from '@/features/projects/labels';
import type { AssignableEmployee, ProjectCard, ProjectTask, TaskEvent, TaskWorkload } from '@/features/projects/types';
import { corpsRemise, depotPret, SAISIE_REMISE_VIDE, type SaisieRemise } from './champs-remise';
import { FormulaireDepot } from './formulaire-depot';
import { FilDiscussion } from './fil-discussion';
import { Infobulle } from '@/components/infobulle';
import { daysBetween, formatDate, todayIso } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';

type Props = {
  slug: string;
  projetId: string;
  code: string;
  carte: ProjectCard;
  tache: ProjectTask;
  // null = pas le droit d'assigner (lecture seule).
  assignables: AssignableEmployee[] | null;
  moiId: string;
  // null = lecture seule du fil.
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>;
  // « Prolonger » depuis Mes tâches : le formulaire s'ouvre directement.
  prolongationOuverte?: boolean;
};

// Panneau d'une tâche (maquette « Projets », réorganisé le 23/10/2026) :
// en-tête (étape, nom de la tâche, statut) ; barre d'actions « Déposer » /
// « Demander un délai » qui ouvre UN formulaire à la fois ; résumé (échéance,
// validation, durée) ; décisions du valideur (remise, prolongation, visa) et
// assignation ; discussion ; « Détails » repliés (fenêtre, échéance figée,
// écart) ; fichiers et historique. Les règles du système sont dans des « ? ».
export function TachePanneau({
  slug,
  projetId,
  code,
  carte,
  tache,
  assignables,
  moiId,
  mentionnables,
  onMaj,
  prolongationOuverte = false,
}: Props) {
  const [aLaCarte, setALaCarte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [historique, setHistorique] = useState<TaskEvent[] | null>(null);
  const [renvoi, setRenvoi] = useState(false);
  const [motif, setMotif] = useState('');
  // Visa DPLG : refus en cours de saisie (motif obligatoire).
  const [refusVisa, setRefusVisa] = useState<string | null>(null);
  // Formulaire ouvert sous la barre d'actions : un seul à la fois.
  const [action, setAction] = useState<'deposer' | 'delai' | null>(prolongationOuverte ? 'delai' : null);
  const [jusquau, setJusquau] = useState('');
  const [motifProlongation, setMotifProlongation] = useState('');
  const [saisie, setSaisie] = useState<SaisieRemise>(SAISIE_REMISE_VIDE);
  const [charges, setCharges] = useState<TaskWorkload | null>(null);

  // Rechargé quand la tâche change, que son assigné change, ou après une
  // remise / décision (statut, version) : la nouvelle ligne apparaît aussitôt.
  useEffect(() => {
    let annule = false;
    setHistorique(null);
    getTaskHistory(slug, projetId, tache.id)
      .then((h) => !annule && setHistorique(h))
      .catch(() => !annule && setHistorique([]));
    return () => {
      annule = true;
    };
  }, [slug, projetId, tache.id, tache.assigne?.id, tache.statut, tache.version, tache.visa?.le]);

  useEffect(() => {
    setALaCarte(false);
    setErreur(null);
    setRenvoi(false);
    setMotif('');
    setAction(prolongationOuverte ? 'delai' : null);
    setJusquau('');
    setMotifProlongation('');
    setSaisie(SAISIE_REMISE_VIDE);
  }, [tache.id, prolongationOuverte]);

  // Charge de chacun sur la fenêtre de la tâche, pour qui peut assigner.
  // Relue quand la tâche ou son assigné change (la charge bouge avec).
  const peutAssigner = assignables !== null;
  useEffect(() => {
    if (!peutAssigner) return;
    let annule = false;
    setCharges(null);
    getTaskWorkload(slug, projetId, tache.id)
      .then((c) => !annule && setCharges(c))
      .catch(() => !annule && setCharges(null));
    return () => {
      annule = true;
    };
  }, [slug, projetId, tache.id, tache.assigne?.id, peutAssigner]);

  async function ouvrirPiece(pieceId: string) {
    setErreur(null);
    try {
      await downloadSubmissionPiece(slug, projetId, tache.id, pieceId);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Fichier indisponible.');
    }
  }

  // Toute action du panneau : erreur affichée, dossier relu ensuite.
  async function agir(action: () => Promise<unknown>, repli: string, apres?: () => void) {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      apres?.();
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : repli);
    } finally {
      setEnCours(false);
    }
  }

  async function decider(decision: 'valider' | 'renvoyer') {
    setEnCours(true);
    setErreur(null);
    try {
      await decideProjectTask(slug, projetId, tache.id, decision, decision === 'renvoyer' ? motif.trim() : undefined);
      setRenvoi(false);
      setMotif('');
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La décision a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  async function assigner(collaborateurId: string) {
    setEnCours(true);
    setErreur(null);
    try {
      await assignTask(slug, projetId, tache.id, collaborateurId || null, aLaCarte);
      // Portée « carte » : un seul usage, pour qu'un changement suivant ne
      // réassigne pas toute la carte par mégarde.
      setALaCarte(false);
      await onMaj();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’assignation a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  const chargeDe = (id: string) => charges?.charges.find((c) => c.collaborateurId === id);
  const pastille = taskPill(tache.etat, tache.prolongation.accordeeJusquau ?? tache.finLe);
  const piecesVersion = tache.pieces.filter((f) => f.version === tache.version);
  const ecart = tache.etat.code === 'validee' ? tache.etat.ecart : null;
  const v = tache.validation;
  const gestionnaire = assignables !== null;
  const assignable =
    assignables !== null &&
    carte.etat.code !== 'desactivee' &&
    tache.statut !== 'validee' &&
    tache.statut !== 'non_necessaire';
  const basculer = (a: 'deposer' | 'delai') => setAction((x) => (x === a ? null : a));

  // Résumé : ce qu'il faut savoir d'un coup d'œil.
  const echeance = tache.prolongation.accordeeJusquau ?? tache.finLe;
  // Retard affiché : en retard, ou reprise dont l'échéance est passée.
  const aujourdhui = todayIso();
  const joursRetard =
    tache.etat.code === 'en_retard'
      ? tache.etat.jours
      : tache.etat.code === 'reprise' && echeance && echeance < aujourdhui
        ? daysBetween(echeance, aujourdhui)
        : null;
  const resume: [string, React.ReactNode][] = [];
  if (gestionnaire) resume.push(['Assignée à', tache.assigne?.nom ?? 'À assigner']);
  resume.push([
    'Échéance',
    echeance ? (
      <>
        {formatDate(echeance)}
        {tache.prolongation.accordeeJusquau && <span className="tp-secondaire"> · délai accordé</span>}
        {joursRetard !== null && <span className="po-retard"> · {joursRetard} j de retard</span>}
      </>
    ) : (
      'pas encore de date'
    ),
  ]);
  resume.push([
    'Validation',
    v.mode === 'depot' ? (
      <>
        le dépôt vaut validation{' '}
        <Infobulle>
          Tâche sans temps atelier : déposer le justificatif suffit (exception écrite au principe 4).
        </Infobulle>
      </>
    ) : (
      <>
        {v.nom ?? 'à désigner'} <span className="tp-secondaire">({v.role})</span>
        {/* Pourquoi pas le chef de team : utile au gestionnaire, pas à l'assigné. */}
        {gestionnaire && v.motif && <span className="tp-secondaire"> · {v.motif}</span>}
      </>
    ),
  ]);
  resume.push([
    'Durée prévue',
    <>
      {dureeStandard(tache)}{' '}
      {tache.heures !== null && (
        <Infobulle>Temps calculé à partir de la durée standard de la tâche : rien à saisir.</Infobulle>
      )}
    </>,
  ]);
  if (tache.valideeLe) {
    resume.push([
      'Validée',
      `le ${formatDate(tache.valideeLe)}${tache.valideePar ? ` par ${tache.valideePar}` : ''}${v.mode === 'depot' ? ' (dépôt)' : ''}`,
    ]);
  }

  // Détails repliés : les règles de calendrier.
  const details: [string, React.ReactNode][] = [
    [
      'Fenêtre',
      tache.debutJ !== null && tache.debutLe && tache.finLe
        ? `J${tache.debutJ} → J${tache.finJ} · ${formatDate(tache.debutLe)} → ${formatDate(tache.finLe)}`
        : '—',
    ],
    [
      'Échéance de référence',
      tache.finLe ? (
        <>
          {formatDate(tache.finLe)}{' '}
          <Infobulle>
            Délai figé à l’ouverture du projet : une prolongation accordée qualifie le retard, elle ne déplace pas cette
            date.
          </Infobulle>
        </>
      ) : (
        '—'
      ),
    ],
  ];
  if (ecart) {
    details.push([
      'Écart',
      <span key="ecart" className={ecart > 0 ? 'po-avance' : 'po-retard'}>
        {ecart > 0 ? `${ecart} h d’avance à la remise` : `${-ecart} h de retard à la remise`}
      </span>,
    ]);
  }
  if (tache.prolongation.accordeeJusquau) {
    details.push(['Prolongation', `accordée jusqu’au ${formatDate(tache.prolongation.accordeeJusquau)}`]);
  }

  const lignes = (l: [string, React.ReactNode][]) => (
    <dl className="po-panneau-lignes">
      {l.map(([dt, dd]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd>{dd}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <aside className="po-panneau tp" aria-label={`Tâche ${tache.libelle}`}>
      <header className="tp-entete">
        <p className="po-kicker">
          {stepNumber(carte.etapeNumero)} {carte.etapeLibelle} · {carte.libelle}
        </p>
        <h2 className="po-panneau-titre">{tache.libelle}</h2>
        <div className="po-pastilles">
          <Pill tone={pastille.ton}>{pastille.libelle}</Pill>
          {tache.sourceNative && <Pill tone="neutre">source native exigée</Pill>}
        </div>
      </header>

      {(tache.peutRemettre || tache.peutDemanderProlongation) && (
        <div className="tp-actions" role="group" aria-label="Actions sur la tâche">
          {tache.peutRemettre && (
            // Formulaire ouvert : son propre bouton « Déposer » est l'action
            // principale ; celui de la barre passe en contour (un seul plein).
            <button
              type="button"
              className={action === 'deposer' ? 'btn-ghost' : 'btn-primary'}
              aria-expanded={action === 'deposer'}
              onClick={() => basculer('deposer')}
            >
              {v.mode === 'depot'
                ? 'Déposer le justificatif'
                : tache.statut === 'reprise'
                  ? 'Déposer la reprise'
                  : 'Déposer'}
            </button>
          )}
          {tache.peutDemanderProlongation && (
            <button
              type="button"
              className="btn-ghost"
              aria-expanded={action === 'delai'}
              onClick={() => basculer('delai')}
            >
              Demander un délai
            </button>
          )}
        </div>
      )}

      {action === 'deposer' && tache.peutRemettre && (
        <div className="po-panneau-bloc tp-formulaire">
          <p className="tp-section">
            {tache.statut === 'reprise' ? 'Reprise demandée' : 'Dépôt'} · v{String(tache.version + 1).padStart(2, '0')}
          </p>
          <FormulaireDepot
            id={`po-remise-${tache.id}`}
            nommage={{ code, etapeNumero: carte.etapeNumero, tache: tache.libelle, version: tache.version + 1 }}
            validateur={v.mode === 'personne' && v.nom ? `${v.nom} (${v.role})` : null}
            parDepot={v.mode === 'depot'}
            obligatoire={tache.fichierObligatoire}
            valeur={saisie}
            onChange={setSaisie}
          />
          <div className="po-decision">
            <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setAction(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={enCours || !depotPret(saisie, tache.fichierObligatoire)}
              onClick={() =>
                agir(
                  () => submitProjectTask(slug, projetId, tache.id, corpsRemise(saisie)),
                  'La remise a échoué.',
                  () => {
                    setSaisie(SAISIE_REMISE_VIDE);
                    setAction(null);
                  },
                )
              }
            >
              {enCours ? '…' : v.mode === 'depot' ? 'Déposer le justificatif' : 'Déposer'}
            </button>
          </div>
        </div>
      )}

      {action === 'delai' && tache.peutDemanderProlongation && (
        <div className="po-panneau-bloc tp-formulaire">
          <p className="tp-section">
            Demander un délai{' '}
            <Infobulle>
              Votre N+1 accorde ou refuse. Accordé, le retard est qualifié jusqu’à la nouvelle date ; l’échéance de
              référence ne change pas.
            </Infobulle>
          </p>
          <label className="po-panneau-label" htmlFor="po-jusquau">
            Nouvelle date
          </label>
          <input
            id="po-jusquau"
            className="field-input"
            type="date"
            value={jusquau}
            min={tache.finLe ?? undefined}
            onChange={(e) => setJusquau(e.target.value)}
          />
          <label className="po-panneau-label" htmlFor="po-motif-prolongation">
            Motif
          </label>
          <textarea
            id="po-motif-prolongation"
            className="field-input"
            rows={2}
            maxLength={500}
            value={motifProlongation}
            onChange={(e) => setMotifProlongation(e.target.value)}
          />
          <div className="po-decision">
            <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setAction(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={enCours || !jusquau || motifProlongation.trim().length < 3}
              onClick={() =>
                agir(
                  () => requestExtension(slug, projetId, tache.id, jusquau, motifProlongation.trim()),
                  'La demande a échoué.',
                  () => setAction(null),
                )
              }
            >
              Envoyer la demande
            </button>
          </div>
        </div>
      )}
      {erreur && <FieldError>{erreur}</FieldError>}

      {lignes(resume)}

      {tache.avenant && (
        <p className="po-panneau-note">
          Facturé par l’avenant{' '}
          <Link className="lien-inline" href={`/admin/${slug}/facturation?devis=${tache.avenant.devisId}`}>
            {tache.avenant.reference ?? 'en préparation'}
          </Link>{' '}
          · {STATUTS_DEVIS[tache.avenant.statut]}
          {tache.avenant.statut === 'brouillon' && ' : à envoyer au client'}
        </p>
      )}
      {tache.etat.code === 'non_necessaire' && tache.motif && (
        <p className="po-panneau-note">Non nécessaire : {tache.motif}.</p>
      )}
      {carte.etat.code === 'desactivee' && (
        <p className="po-panneau-note">Carte désactivée : {carte.etat.motif}. Son temps n’est pas compté.</p>
      )}
      {tache.descriptif && (
        <div className="po-descriptif">
          <p className="tp-section">Descriptif</p>
          <p>{tache.descriptif}</p>
        </div>
      )}

      {tache.prolongation.enAttente && (
        <div className="po-panneau-bloc">
          <p className="tp-section">Délai demandé</p>
          <p className="po-aide">
            Jusqu’au {formatDate(tache.prolongation.enAttente.jusquau)} : {tache.prolongation.enAttente.motif}
          </p>
          {tache.peutDeciderProlongation ? (
            <div className="po-decision">
              <button
                type="button"
                className="btn-ghost"
                disabled={enCours}
                onClick={() => agir(() => decideExtension(slug, projetId, tache.id, false), 'La décision a échoué.')}
              >
                Refuser
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={enCours}
                onClick={() => agir(() => decideExtension(slug, projetId, tache.id, true), 'La décision a échoué.')}
              >
                Accorder (retard qualifié)
              </button>
            </div>
          ) : (
            <p className="po-aide">En attente de la réponse du validateur.</p>
          )}
        </div>
      )}
      {/* Visa DPLG (revue Dir. GC) : validée par le chef de team, la tâche
          attend la signature de l'architecte ; apposé, il est daté et nommé. */}
      {tache.visa && (tache.statut === 'validee' || tache.visa.le) && (
        <div className="po-panneau-bloc">
          <p className="tp-section">Visa DPLG</p>
          {tache.visa.nonTrace ? (
            <p className="po-aide">
              Visa non tracé (antérieur au 21/10/2026) : la tâche a été validée avant la règle du visa.
            </p>
          ) : tache.visa.le ? (
            <p className="po-aide">
              Apposé le {formatDate(tache.visa.le)}
              {tache.visa.par ? ` par ${tache.visa.par}` : ''}.
            </p>
          ) : (
            <p className="po-aide">
              Validée par le chef de team : le visa de l’architecte DPLG est attendu avant la suite.
            </p>
          )}
          {tache.peutViser &&
            (refusVisa !== null ? (
              <>
                <label className="po-panneau-label" htmlFor="po-motif-visa">
                  Motif du refus (la tâche repart en reprise)
                </label>
                <textarea
                  id="po-motif-visa"
                  className="field-input"
                  rows={2}
                  maxLength={500}
                  value={refusVisa}
                  onChange={(e) => setRefusVisa(e.target.value)}
                />
                <div className="po-decision">
                  <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setRefusVisa(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={enCours || refusVisa.trim().length < 3}
                    onClick={() =>
                      agir(
                        () => setTaskVisa(slug, projetId, tache.id, false, refusVisa.trim()),
                        'Le refus a échoué.',
                        () => setRefusVisa(null),
                      )
                    }
                  >
                    Refuser le visa
                  </button>
                </div>
              </>
            ) : (
              <div className="po-decision">
                <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setRefusVisa('')}>
                  Refuser le visa
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={enCours}
                  onClick={() => agir(() => setTaskVisa(slug, projetId, tache.id, true), 'Le visa a échoué.')}
                >
                  Apposer le visa DPLG
                </button>
              </div>
            ))}
        </div>
      )}
      {tache.peutDecider && (
        <div className="po-panneau-bloc">
          <p className="tp-section">Remise v{String(tache.version).padStart(2, '0')} à valider</p>
          {piecesVersion.length ? (
            <ul className="po-historique">
              {piecesVersion.map((f) => (
                <li key={f.id}>
                  <button type="button" className="po-fichier" onClick={() => ouvrirPiece(f.id)}>
                    {f.nom}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="po-aide">Sans fichier joint.</p>
          )}
          {renvoi ? (
            <>
              <label className="po-panneau-label" htmlFor="po-motif">
                Motif de la reprise
              </label>
              <textarea
                id="po-motif"
                className="field-input"
                rows={2}
                maxLength={500}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
              <div className="po-decision">
                <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setRenvoi(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={enCours || motif.trim().length < 3}
                  onClick={() => decider('renvoyer')}
                >
                  Renvoyer en reprise
                </button>
              </div>
            </>
          ) : (
            <div className="po-decision">
              <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setRenvoi(true)}>
                Renvoyer en reprise
              </button>
              <button type="button" className="btn-primary" disabled={enCours} onClick={() => decider('valider')}>
                Valider la remise
              </button>
            </div>
          )}
        </div>
      )}
      {assignable && (
        <div className="po-panneau-bloc">
          <label className="tp-section" htmlFor="po-assigner">
            Assigner
          </label>
          <select
            id="po-assigner"
            className="field-input"
            value={tache.assigne?.id ?? ''}
            disabled={enCours}
            onChange={(e) => assigner(e.target.value)}
          >
            <option value="">À assigner</option>
            {assignables.map((a) => {
              const charge = workloadLabel(chargeDe(a.id), charges?.zone ?? null);
              return (
                <option key={a.id} value={a.id}>
                  {a.nom}
                  {a.cellule ? ` · ${a.cellule}` : ''}
                  {charge ? ` — ${charge}` : ''}
                </option>
              );
            })}
          </select>
          {charges?.periode && (
            <p className="po-aide">
              Charge prévisionnelle du {formatDate(charges.periode.debut)} au {formatDate(charges.periode.fin)}, cette
              tâche comprise
              {charges.zone ? ` (zone normale ${charges.zone.de} à ${charges.zone.a} %)` : ''}.
              {tache.assigne && chargeDe(tache.assigne.id) && (
                <>
                  {' '}
                  {tache.assigne.nom} : {chargeDe(tache.assigne.id)!.assignees} h déjà prévues sur{' '}
                  {chargeDe(tache.assigne.id)!.disponibles} h disponibles
                  {chargeDe(tache.assigne.id)!.joursAbsence
                    ? `, ${chargeDe(tache.assigne.id)!.joursAbsence} j d’absence`
                    : ''}
                  .
                </>
              )}
            </p>
          )}
          {carte.taches.length > 1 && (
            <label className="po-case">
              <input
                type="checkbox"
                checked={aLaCarte}
                disabled={enCours}
                onChange={(e) => setALaCarte(e.target.checked)}
              />
              <span>Toute la carte « {carte.libelle} » (ses tâches encore ouvertes)</span>
            </label>
          )}
        </div>
      )}

      <FilDiscussion
        slug={slug}
        projetId={projetId}
        tacheId={tache.id}
        moiId={moiId}
        mentionnables={mentionnables}
        onMaj={onMaj}
      />

      <details className="tp-details">
        <summary className="tp-section">Détails</summary>
        {lignes(details)}
      </details>

      <div className="po-panneau-bloc">
        <p className="tp-section">
          Fichiers déposés{' '}
          <Infobulle>Une version par dépôt (v01, v02…). Convention de nommage : {code}_ÉTAPE_LIVRABLE_vNN.</Infobulle>
        </p>
        {tache.pieces.length ? (
          <ul className="po-historique">
            {tache.pieces.map((f) => (
              <li key={f.id}>
                v{String(f.version).padStart(2, '0')} ·{' '}
                <button type="button" className="po-fichier" onClick={() => ouvrirPiece(f.id)}>
                  {f.nom}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="po-aide">Aucun fichier.</p>
        )}
      </div>
      <div className="po-panneau-bloc">
        <p className="tp-section">Historique</p>
        {!historique ? (
          <p className="po-aide">Chargement…</p>
        ) : historique.length === 0 ? (
          <p className="po-aide">Aucun événement.</p>
        ) : (
          <ul className="po-historique">
            {historique.map((e) => (
              <li key={e.id}>
                {formatDate(e.le)} · {e.detail}
                {e.par && ` par ${e.par}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function dureeStandard(t: ProjectTask): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h`;
  if (t.temps.type === 'partage') return t.temps.libelle;
  return 'Sans temps atelier';
}
