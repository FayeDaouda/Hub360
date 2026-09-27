'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { getHistorique } from '@/lib/crm';
import {
  ACTIONS_CRM,
  CLASSE_STATUT,
  actionsPossibles,
  raisonBlocage,
  type ActionCrm,
} from '@/lib/cycle-crm';
import { formatDateCourte } from '@/lib/format';
import { useSessionCourante } from '@/lib/layout-contexte';
import { STATUTS_CRM, type Projet, type TransitionDossier } from '@/lib/types';

type Props = {
  slug: string;
  projet: Projet;
  // Rejeter la promesse garde le panneau ouvert + affiche l'erreur en ligne.
  onAgir: (action: ActionCrm, commentaire?: string) => Promise<void>;
};

// Cycle commercial d'un dossier (étapes E-F) : statut, actions permises à ce
// rôle, commentaire de la DAF en cas de renvoi, et journal. Toute action
// passe par une confirmation qui dit ce qu'elle va provoquer — plusieurs
// sont définitives (onboard crée le projet, perdu sort du pipeline).
export function CycleDossier({ slug, projet, onAgir }: Props) {
  const session = useSessionCourante();
  const [historique, setHistorique] = useState<TransitionDossier[] | null>(null);
  const [action, setAction] = useState<ActionCrm | null>(null);
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Rechargé à chaque changement de statut (le journal vient de grandir).
  useEffect(() => {
    let annule = false;
    setHistorique(null);
    getHistorique(slug, projet.id)
      .then((h) => {
        if (!annule) setHistorique(h);
      })
      .catch(() => {
        if (!annule) setHistorique([]);
      });
    return () => {
      annule = true;
    };
  }, [slug, projet.id, projet.statut]);

  const actions = actionsPossibles(projet.statut, session);
  // Actions permises par le rôle mais pas encore par l'offre (étape F).
  const blocages = actions
    .map((a) => ({ a, raison: raisonBlocage(a, projet) }))
    .filter((b): b is { a: ActionCrm; raison: string } => b.raison !== null);
  const def = action ? ACTIONS_CRM[action] : null;

  // Dernier renvoi de la DAF, affiché tant que le dossier n'est pas resoumis.
  const dernier = historique?.[historique.length - 1];
  const renvoi =
    projet.statut === 'nouveau_projet' && dernier?.de === 'en_validation' ? dernier : null;
  // Motif de perte : la ligne qui a fait passer le dossier en « perdu ».
  const perte = projet.statut === 'perdu' ? dernier : null;

  function choisir(a: ActionCrm) {
    setAction(a);
    setTexte('');
    setErreur(null);
  }

  async function confirmer() {
    if (!action || !def) return;
    if (def.texte && !texte.trim()) return setErreur(`${def.texte.label} : obligatoire.`);
    setEnCours(true);
    setErreur(null);
    try {
      await onAgir(action, def.texte ? texte.trim() : undefined);
      setAction(null);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’action a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="cycle-dossier" aria-label="Cycle commercial">
      <div className="cycle-dossier-tete">
        <span className="field-label">Statut</span>
        <span className={`pill statut-select--${CLASSE_STATUT[projet.statut]}`}>
          {STATUTS_CRM[projet.statut]}
        </span>
        {projet.verrouillee && (
          <span className="cycle-dossier-verrou" title="Contenu figé depuis la soumission à la DAF">
            <Lock size={12} strokeWidth={2} aria-hidden />
            Fiche figée
          </span>
        )}
      </div>

      {renvoi && (
        <p className="cycle-dossier-note cycle-dossier-note--renvoi" role="note">
          <strong>Renvoyé par {renvoi.par?.nom ?? 'la DAF'} :</strong> {renvoi.commentaire}
        </p>
      )}
      {perte?.commentaire && (
        <p className="cycle-dossier-note cycle-dossier-note--perte" role="note">
          <strong>Motif :</strong> {perte.commentaire}
        </p>
      )}

      {!def && actions.length > 0 && (
        <div className="cycle-dossier-actions">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              className={
                ACTIONS_CRM[a].ton === 'principal'
                  ? 'btn-primary'
                  : `btn-ghost btn-ghost--sm${ACTIONS_CRM[a].ton === 'danger' ? ' btn-ghost--danger' : ''}`
              }
              disabled={blocages.some((b) => b.a === a)}
              onClick={() => choisir(a)}
            >
              {ACTIONS_CRM[a].libelle}
            </button>
          ))}
        </div>
      )}
      {!def &&
        blocages.map((b) => (
          <p key={b.a} className="field-aide">
            {ACTIONS_CRM[b.a].libelle} : {b.raison}
          </p>
        ))}

      {def && (
        <div className="field-bloc">
          <strong className="cycle-dossier-confirm-titre">{def.libelle}</strong>
          <span className="field-aide">{def.consequence}</span>
          {def.texte && (
            <label className="field">
              <span className="field-label">{def.texte.label}</span>
              <textarea
                className="field-input"
                rows={3}
                maxLength={1000}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                placeholder={def.texte.placeholder}
                autoFocus
              />
            </label>
          )}
          {erreur && <p className="field-erreur">{erreur}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setAction(null)}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className={def.ton === 'danger' ? 'btn-danger' : 'btn-primary'}
              onClick={confirmer}
              disabled={enCours}
            >
              {enCours ? 'Envoi…' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      <details className="cycle-dossier-historique">
        <summary>Historique{historique ? ` (${historique.length})` : ''}</summary>
        {!historique ? (
          <p className="field-aide">Chargement…</p>
        ) : (
          <ol>
            {historique.map((t) => (
              <li key={t.id}>
                <span className="cycle-dossier-date">{formatDateCourte(t.le)}</span>
                <span>
                  {t.de ? `${STATUTS_CRM[t.de]} → ` : ''}
                  <strong>{STATUTS_CRM[t.vers]}</strong>
                  {/* Sans auteur : reprise de données (création) ou le client
                      lui-même (refus via le lien de l'offre). */}
                  {t.par ? ` · ${t.par.nom}` : t.de ? ' · le client' : ''}
                  {t.commentaire && <span className="cell-sub">« {t.commentaire} »</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
