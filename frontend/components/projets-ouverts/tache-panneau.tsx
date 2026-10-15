'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STATUTS_DEVIS } from '@/lib/types';
import {
  assignerTache,
  deciderProlongation,
  deciderTache,
  demanderProlongation,
  remettreTache,
  getChargesTache,
  getHistoriqueTache,
  libelleCharge,
  telechargerPieceRemise,
  type ChargesTache,
  jjmmaaaa,
  numeroEtape,
  pastilleTache,
  type Assignable,
  type CarteOuverte,
  type EvenementTache,
  type TacheOuverte,
} from '@/lib/projets-ouverts';
import { ChampsRemise, corpsRemise, SAISIE_REMISE_VIDE, type SaisieRemise } from './champs-remise';
import { FilDiscussion } from './fil-discussion';

type Props = {
  slug: string;
  projetId: string;
  code: string;
  carte: CarteOuverte;
  tache: TacheOuverte;
  // null = pas le droit d'assigner (lecture seule).
  assignables: Assignable[] | null;
  moiId: string;
  // null = lecture seule du fil.
  mentionnables: { id: string; nom: string }[] | null;
  onMaj: () => Promise<void>;
};

// Panneau d'une tâche (maquette « Projets ») : qui, qui valide, durée,
// fenêtre et échéance figées, écart, descriptif, assignation (à la tâche ou à
// toute la carte), fichiers, fil de discussion et historique. Remise et
// validation : avec les vues chef de team et collaborateur.
export function TachePanneau({ slug, projetId, code, carte, tache, assignables, moiId, mentionnables, onMaj }: Props) {
  const [aLaCarte, setALaCarte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [historique, setHistorique] = useState<EvenementTache[] | null>(null);
  const [renvoi, setRenvoi] = useState(false);
  const [motif, setMotif] = useState('');
  const [prolonger, setProlonger] = useState(false);
  const [jusquau, setJusquau] = useState('');
  const [motifProlongation, setMotifProlongation] = useState('');
  const [saisie, setSaisie] = useState<SaisieRemise>(SAISIE_REMISE_VIDE);
  const [charges, setCharges] = useState<ChargesTache | null>(null);

  // Rechargé quand la tâche change ou que son assigné change (nouvelle ligne).
  useEffect(() => {
    let annule = false;
    setHistorique(null);
    getHistoriqueTache(slug, projetId, tache.id)
      .then((h) => !annule && setHistorique(h))
      .catch(() => !annule && setHistorique([]));
    return () => {
      annule = true;
    };
  }, [slug, projetId, tache.id, tache.assigne?.id]);

  useEffect(() => {
    setALaCarte(false);
    setErreur(null);
    setRenvoi(false);
    setMotif('');
    setProlonger(false);
    setJusquau('');
    setMotifProlongation('');
    setSaisie(SAISIE_REMISE_VIDE);
  }, [tache.id]);

  // Charge de chacun sur la fenêtre de la tâche, pour qui peut assigner.
  // Relue quand la tâche ou son assigné change (la charge bouge avec).
  const peutAssigner = assignables !== null;
  useEffect(() => {
    if (!peutAssigner) return;
    let annule = false;
    setCharges(null);
    getChargesTache(slug, projetId, tache.id)
      .then((c) => !annule && setCharges(c))
      .catch(() => !annule && setCharges(null));
    return () => {
      annule = true;
    };
  }, [slug, projetId, tache.id, tache.assigne?.id, peutAssigner]);

  async function ouvrirPiece(pieceId: string) {
    setErreur(null);
    try {
      await telechargerPieceRemise(slug, projetId, tache.id, pieceId);
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
      await deciderTache(slug, projetId, tache.id, decision, decision === 'renvoyer' ? motif.trim() : undefined);
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
      await assignerTache(slug, projetId, tache.id, collaborateurId || null, aLaCarte);
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
  const pastille = pastilleTache(tache.etat);
  const piecesVersion = tache.pieces.filter((f) => f.version === tache.version);
  const ecart = tache.etat.code === 'validee' ? tache.etat.ecart : null;
  const v = tache.validation;
  const assignable =
    assignables !== null && carte.etat.code !== 'desactivee' && tache.statut !== 'validee' && tache.statut !== 'non_necessaire';
  const lignes: [string, React.ReactNode][] = [
    ['Assignée à', tache.assigne?.nom ?? 'À assigner'],
    [
      'Validation',
      v.mode === 'depot' ? 'dépôt du justificatif = validation (exception écrite au principe 4)' : `${v.nom ?? 'à désigner'} · ${v.role}`,
    ],
    ['Durée standard', dureeStandard(tache)],
    [
      'Fenêtre',
      tache.debutJ !== null && tache.debutLe && tache.finLe
        ? `J${tache.debutJ} → J${tache.finJ} · ${jjmmaaaa(tache.debutLe)} → ${jjmmaaaa(tache.finLe)}`
        : '—',
    ],
    ['Échéance de référence', tache.finLe ? `${jjmmaaaa(tache.finLe)} · délai figé` : '—'],
  ];
  if (ecart) {
    lignes.push([
      'Écart (performance)',
      <span key="ecart" className={ecart > 0 ? 'po-avance' : 'po-retard'}>
        {ecart > 0 ? `${ecart} h d’avance à la remise` : `${-ecart} h de retard à la remise`}
      </span>,
    ]);
  }
  if (tache.prolongation.accordeeJusquau) {
    lignes.push(['Prolongation', `accordée jusqu’au ${jjmmaaaa(tache.prolongation.accordeeJusquau)} · retard qualifié, échéance de référence inchangée`]);
  }
  if (tache.valideeLe) {
    lignes.push(['Validée', `le ${jjmmaaaa(tache.valideeLe)}${tache.valideePar ? ` par ${tache.valideePar}` : ''}${v.mode === 'depot' ? ' (dépôt)' : ''}`]);
  }

  return (
    <aside className="po-panneau" aria-label={`Tâche ${tache.libelle}`}>
      <p className="po-kicker">
        {numeroEtape(carte.etapeNumero)} {carte.etapeLibelle} · {carte.libelle}
      </p>
      <h3 className="po-panneau-titre">{tache.libelle}</h3>
      <div className="po-pastilles">
        <span className={`pill pill--${pastille.ton}`}>{pastille.libelle}</span>
        {tache.sourceNative && <span className="pill pill--neutre">source native exigée</span>}
      </div>
      <dl className="po-panneau-lignes">
        {lignes.map(([dt, dd]) => (
          <div key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </div>
        ))}
      </dl>
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
      {tache.etat.code === 'non_necessaire' && tache.motif && <p className="po-panneau-note">Non nécessaire : {tache.motif}.</p>}
      {carte.etat.code === 'desactivee' && (
        <p className="po-panneau-note">Carte désactivée : {carte.etat.motif}. Son temps n’est pas compté.</p>
      )}
      {tache.descriptif && (
        <div className="po-descriptif">
          <p className="po-kicker">Descriptif</p>
          <p>{tache.descriptif}</p>
        </div>
      )}
      {tache.peutRemettre && (
        <div className="po-panneau-bloc">
          <p className="po-kicker">
            {tache.statut === 'reprise' ? 'Reprise demandée' : 'À remettre'} · v{String(tache.version + 1).padStart(2, '0')}
          </p>
          <p className="po-aide">
            {v.mode === 'depot'
              ? 'Le dépôt du justificatif vaut validation (exception écrite au principe 4).'
              : `Votre remise part en validation auprès de : ${v.nom ?? 'à désigner'} (${v.role}).`}
          </p>
          <ChampsRemise id={`po-remise-${tache.id}`} valeur={saisie} onChange={setSaisie} />
          <div className="po-decision">
            <button
              type="button"
              className="btn-primary"
              disabled={enCours}
              onClick={() => agir(() => remettreTache(slug, projetId, tache.id, corpsRemise(saisie)), 'La remise a échoué.', () => setSaisie(SAISIE_REMISE_VIDE))}
            >
              {enCours ? '…' : v.mode === 'depot' ? 'Déposer le justificatif' : 'Remettre la tâche'}
            </button>
          </div>
        </div>
      )}
      {erreur && <p className="field-erreur">{erreur}</p>}
      {tache.prolongation.enAttente && (
        <div className="po-panneau-bloc">
          <p className="po-kicker">Prolongation demandée</p>
          <p className="po-aide">
            Jusqu’au {jjmmaaaa(tache.prolongation.enAttente.jusquau)} : {tache.prolongation.enAttente.motif}
          </p>
          {tache.peutDeciderProlongation ? (
            <div className="po-decision">
              <button
                type="button"
                className="btn-ghost"
                disabled={enCours}
                onClick={() => agir(() => deciderProlongation(slug, projetId, tache.id, false), 'La décision a échoué.')}
              >
                Refuser
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={enCours}
                onClick={() => agir(() => deciderProlongation(slug, projetId, tache.id, true), 'La décision a échoué.')}
              >
                Accorder (retard qualifié)
              </button>
            </div>
          ) : (
            <p className="po-aide">En attente de la décision du chef de team ou de l’Architecte DPLG.</p>
          )}
        </div>
      )}
      {tache.peutDemanderProlongation && (
        <div className="po-panneau-bloc">
          {prolonger ? (
            <>
              <p className="po-kicker">Demander une prolongation</p>
              <p className="po-aide">L’échéance de référence reste figée : accordée, la prolongation qualifie le retard jusqu’à la nouvelle date.</p>
              <label className="po-panneau-label" htmlFor="po-jusquau">
                Nouvelle date
              </label>
              <input id="po-jusquau" className="field-input" type="date" value={jusquau} min={tache.finLe ?? undefined} onChange={(e) => setJusquau(e.target.value)} />
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
                <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setProlonger(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={enCours || !jusquau || motifProlongation.trim().length < 3}
                  onClick={() =>
                    agir(() => demanderProlongation(slug, projetId, tache.id, jusquau, motifProlongation.trim()), 'La demande a échoué.', () => setProlonger(false))
                  }
                >
                  Envoyer la demande
                </button>
              </div>
            </>
          ) : (
            <div className="po-decision">
              <button type="button" className="btn-ghost" onClick={() => setProlonger(true)}>
                Demander une prolongation
              </button>
            </div>
          )}
        </div>
      )}
      {tache.peutDecider && (
        <div className="po-panneau-bloc">
          <p className="po-kicker">Remise v{String(tache.version).padStart(2, '0')} à valider</p>
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
              <textarea id="po-motif" className="field-input" rows={2} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
              <div className="po-decision">
                <button type="button" className="btn-ghost" disabled={enCours} onClick={() => setRenvoi(false)}>
                  Annuler
                </button>
                <button type="button" className="btn-primary" disabled={enCours || motif.trim().length < 3} onClick={() => decider('renvoyer')}>
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
          <label className="po-panneau-label" htmlFor="po-assigner">
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
              const charge = libelleCharge(chargeDe(a.id), charges?.zone ?? null);
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
              Charge prévisionnelle du {jjmmaaaa(charges.periode.debut)} au {jjmmaaaa(charges.periode.fin)}, cette tâche comprise
              {charges.zone ? ` (zone normale ${charges.zone.de} à ${charges.zone.a} %)` : ''}.
              {tache.assigne && chargeDe(tache.assigne.id) && (
                <>
                  {' '}
                  {tache.assigne.nom} : {chargeDe(tache.assigne.id)!.assignees} h déjà prévues sur {chargeDe(tache.assigne.id)!.disponibles} h
                  disponibles
                  {chargeDe(tache.assigne.id)!.joursAbsence ? `, ${chargeDe(tache.assigne.id)!.joursAbsence} j d’absence` : ''}.
                </>
              )}
            </p>
          )}
          {carte.taches.length > 1 && (
            <label className="po-case">
              <input type="checkbox" checked={aLaCarte} disabled={enCours} onChange={(e) => setALaCarte(e.target.checked)} />
              <span>Toute la carte « {carte.libelle} » (ses tâches encore ouvertes)</span>
            </label>
          )}
        </div>
      )}
      <div className="po-panneau-bloc">
        <p className="po-kicker">Fichiers</p>
        <p className="po-aide">nommage {code}_ÉTAPE_LIVRABLE_vNN, une version par reprise</p>
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
      <FilDiscussion slug={slug} projetId={projetId} tacheId={tache.id} moiId={moiId} mentionnables={mentionnables} onMaj={onMaj} />
      <div className="po-panneau-bloc">
        <p className="po-kicker">Historique</p>
        {!historique ? (
          <p className="po-aide">Chargement…</p>
        ) : historique.length === 0 ? (
          <p className="po-aide">Aucun événement.</p>
        ) : (
          <ul className="po-historique">
            {historique.map((e) => (
              <li key={e.id}>
                {jjmmaaaa(e.le)} · {e.detail}
                {e.par && ` par ${e.par}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function dureeStandard(t: TacheOuverte): string {
  if (t.heures !== null) return `${String(t.heures).replace('.', ',')} h · temps calculé, aucune saisie`;
  if (t.temps.type === 'partage') return t.temps.libelle;
  return 'Sans temps atelier';
}
