'use client';

import { useState } from 'react';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante } from '@/lib/layout-contexte';
import { modifierApporteur } from '@/lib/crm';
import { PaiementApporteur } from '@/components/crm/paiement-apporteur';
import { ETAPE, formatDate, formatNumber } from '@hub/domain';
import type { Projet } from '@/lib/types';
import {
  FicheApporteurChamps,
  saisieDepuisProjet,
  versApporteurSaisi,
  type SaisieApporteur,
} from './fiche-apporteur-champs';
import { FieldError } from '@/components/ui/field';

// Écriture de « Fiche apporteur » (matrice, 31/10/2026) — affichage
// seulement, le serveur tranche.

type Props = {
  slug: string;
  projet: Projet;
  // Après une modification : recharge le dossier et son historique.
  onModifie: () => Promise<void>;
};

// Fiche apporteur d'affaire sur la fiche du dossier : validée et verrouillée
// dès la création (maquette « Nouveau projet », oct. 2026), modifiable avec
// l'Écriture de « Fiche apporteur » (au départ le COO seul).
export function FicheApporteurSection({ slug, projet, onModifie }: Props) {
  const [saisie, setSaisie] = useState<SaisieApporteur | null>(null); // null = lecture
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const peutModifier = niveauSuffisant(useSessionCourante(), ETAPE.crmApporteur, 'ecriture');
  const ap = projet.apporteur;
  const apporteurSaisi = saisie && versApporteurSaisi(saisie);

  async function enregistrer() {
    if (!apporteurSaisi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await modifierApporteur(slug, projet.id, apporteurSaisi);
      await onModifie();
      setSaisie(null);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'L’enregistrement a échoué.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="fiche-crm-section">
      <div className="fiche-crm-titre-ligne">
        <h3 className="fiche-crm-titre">Fiche apporteur d’affaire</h3>
        <span className="fiche-crm-badge fiche-crm-badge--ok">Validée · verrouillée</span>
      </div>
      <div className="fiche-crm-carte">
        {saisie ? (
          <div className="fiche-apporteur-edition" role="group" aria-label="Modifier la fiche apporteur">
            <FicheApporteurChamps saisie={saisie} onChange={setSaisie} idPrefixe="fiche-apporteur" desactive={envoi} />
            {erreur && <FieldError>{erreur}</FieldError>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" disabled={envoi} onClick={() => setSaisie(null)}>
                Annuler
              </button>
              <button type="button" className="btn-primary" disabled={envoi || !apporteurSaisi} onClick={enregistrer}>
                {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : !ap ? (
          <strong>Aucun apporteur · affaire directe</strong>
        ) : (
          <dl className="fiche-crm-apporteur">
            <div>
              <dt>Nom et prénom</dt>
              <dd>{ap.type === 'interne' ? (ap.utilisateur?.nom ?? 'Compte supprimé') : ap.nom}</dd>
            </div>
            <div>
              <dt>Relation</dt>
              <dd>{ap.type === 'interne' ? 'Apporteur interne' : ap.structure || 'Apporteur externe'}</dd>
            </div>
            <div>
              <dt>% attribué</dt>
              <dd className="fiche-crm-pourcent">
                {projet.commissionApporteur == null ? '—' : `${formatNumber(projet.commissionApporteur)} %`}
              </dd>
            </div>
            {ap.type === 'externe' && (
              <>
                <div>
                  <dt>Téléphone</dt>
                  <dd>{ap.telephone || '—'}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{ap.email || '—'}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Validée le</dt>
              <dd>{formatDate(projet.creeLe)}</dd>
            </div>
          </dl>
        )}
        {!saisie && (
          <p className="fiche-crm-aide">
            Établie et validée d’office à la création. Ensuite, seuls les rôles qui en ont le droit dans la matrice
            peuvent la modifier.
          </p>
        )}
        {!saisie && peutModifier && !projet.archive && (
          <button
            type="button"
            className="btn-ghost fiche-apporteur-modifier"
            onClick={() => {
              setErreur(null);
              setSaisie(saisieDepuisProjet(projet));
            }}
          >
            Modifier la fiche apporteur
          </button>
        )}
        {!saisie && ap && <PaiementApporteur slug={slug} dossierId={projet.id} />}
      </div>
    </section>
  );
}
