'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { getHistorique } from '@/lib/crm';
import { ACTIONS_CRM, CLASSE_STATUT, actionsPossibles, raisonBlocage, type ActionCrm } from '@/lib/cycle-crm';
import { useSessionCourante } from '@/lib/layout-contexte';
import { contresigneAffaire, useContresignature } from '@/lib/seuil-ceo';
import { STATUTS_CRM, type Projet, type TransitionDossier } from '@/lib/types';
import { Pill } from '@/components/ui/pill';
import { Field, FieldError } from '@/components/ui/field';
import { ApercuOffre } from './apercu-offre';

type Props = {
  slug: string;
  projet: Projet;
  // Rejeter la promesse garde le panneau ouvert + affiche l'erreur en ligne.
  onAgir: (action: ActionCrm, commentaire?: string) => Promise<void>;
};

// Cycle commercial d'un dossier (étapes E-F) : statut, actions permises à ce
// rôle et commentaire de la DAF en cas de renvoi (le journal est dans la fiche). Toute action
// passe par une confirmation qui dit ce qu'elle va provoquer — plusieurs
// sont définitives (onboard crée le projet, perdu sort du pipeline).
// Valider l'offre passe OBLIGATOIREMENT par son aperçu (09/11/2026) : le CFO
// la lit telle que le client la recevra et la valide en bas du document.
export function CycleDossier({ slug, projet, onAgir }: Props) {
  const session = useSessionCourante();
  const contresignature = useContresignature(slug, session);
  const [historique, setHistorique] = useState<TransitionDossier[] | null>(null);
  const [action, setAction] = useState<ActionCrm | null>(null);
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState(false);

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

  // Valider / renvoyer l'offre : le CEO seulement au-delà du seuil de contresignature.
  const actions = actionsPossibles(projet.statut, session).filter(
    (a) =>
      !(ACTIONS_CRM[a].module === 'finances_devis' && ACTIONS_CRM[a].niveau === 'validation') ||
      contresigneAffaire(session, contresignature, projet.offre?.montantTtc ?? 0),
  );
  // Actions permises par le rôle mais pas encore par l'offre (étape F).
  const blocages = actions
    .map((a) => ({ a, raison: raisonBlocage(a, projet) }))
    .filter((b): b is { a: ActionCrm; raison: string } => b.raison !== null);
  const def = action ? ACTIONS_CRM[action] : null;
  // Offre soumise, visible pour qui a la Lecture de l'offre (clé `offre`).
  const offreSoumise = projet.statut === 'en_validation' && 'offre' in projet ? (projet.offre ?? null) : null;
  const peutValider = actions.includes('valider') && !blocages.some((b) => b.a === 'valider');
  const peutRenvoyer = actions.includes('renvoyer') && !blocages.some((b) => b.a === 'renvoyer');

  // Dernier renvoi de la DAF, affiché tant que le dossier n'est pas resoumis.
  const dernier = historique?.[historique.length - 1];
  const renvoi = projet.statut === 'nouveau_projet' && dernier?.de === 'en_validation' ? dernier : null;
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

  // Ni action possible, ni note, ni offre à consulter : le statut est déjà
  // dans la barre « Situation » et le verrou en tête de fiche (maquette CTO).
  if (actions.length === 0 && !renvoi && !perte?.commentaire && !offreSoumise) return null;

  return (
    <section className="cycle-dossier" aria-label="Cycle commercial">
      <div className="cycle-dossier-tete">
        <span className="field-label">Statut</span>
        <Pill className={`statut-select--${CLASSE_STATUT[projet.statut]}`}>{STATUTS_CRM[projet.statut]}</Pill>
        {projet.verrouillee && (
          <span className="cycle-dossier-verrou" title="Contenu figé depuis la soumission à la DAF">
            <Lock size={12} aria-hidden />
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

      {!def && (actions.length > 0 || offreSoumise) && (
        <div className="cycle-dossier-actions">
          {/* Sans droit de décision (Dir. GC, COO…) : l'offre soumise se consulte. */}
          {offreSoumise && !actions.includes('valider') && (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setApercu(true)}>
              Voir l’offre
            </button>
          )}
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              className={
                ACTIONS_CRM[a].ton === 'principal'
                  ? 'btn-primary'
                  : `btn-ghost btn-ghost--sm${ACTIONS_CRM[a].ton === 'danger' ? ' btn-ghost--danger' : ''}`
              }
              disabled={blocages.some((b) => b.a === a) || (a === 'valider' && !offreSoumise)}
              // Action de l'étape : reprise par le pied de la fiche.
              data-action-principale={ACTIONS_CRM[a].ton === 'principal' ? '' : undefined}
              // Valider = ouvrir l'aperçu : l'envoi se confirme en bas du document.
              onClick={() => (a === 'valider' ? setApercu(true) : choisir(a))}
            >
              {a === 'valider' ? 'Voir l’offre et valider' : ACTIONS_CRM[a].libelle}
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

      {apercu && offreSoumise && (
        <ApercuOffre
          slug={slug}
          offreId={offreSoumise.id}
          dossierCode={projet.code}
          decision={
            peutValider
              ? {
                  onValider: async () => {
                    await onAgir('valider');
                    setApercu(false);
                  },
                  onRenvoyer: peutRenvoyer
                    ? () => {
                        setApercu(false);
                        choisir('renvoyer');
                      }
                    : undefined,
                }
              : null
          }
          onClose={() => setApercu(false)}
        />
      )}

      {def && (
        <div className="field-bloc">
          <strong className="cycle-dossier-confirm-titre">{def.libelle}</strong>
          <span className="field-aide">{def.consequence}</span>
          {def.texte && (
            <Field label={def.texte.label}>
              <textarea
                className="field-input"
                rows={3}
                maxLength={1000}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                placeholder={def.texte.placeholder}
                autoFocus
              />
            </Field>
          )}
          {erreur && <FieldError>{erreur}</FieldError>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setAction(null)} disabled={enCours}>
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
    </section>
  );
}
