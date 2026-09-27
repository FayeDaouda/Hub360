'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { creerDevis, getDevis, majDevis, supprimerDevis } from '@/lib/devis';
import type { ProduitService, Projet } from '@/lib/types';
import {
  LignesDevisEditeur,
  ligneVide,
  lignesDepuisDevis,
  lignesSaisies,
  type LigneForm,
} from './lignes-devis-editeur';

type Props = {
  slug: string;
  projet: Projet; // le dossier CRM
  offreId?: string; // brouillon existant à retravailler ; absent = création
  catalogue: ProduitService[];
  onClose: () => void;
  onEnregistre: () => void; // le parent recharge le dossier
};

// Préparation de l'offre d'un dossier (étape F) — client imposé par le
// dossier, pas de projet ni de date de validité : c'est la validation DAF
// qui l'enverra, valable 7 jours. Modifiable tant que le dossier est en
// « Nouveau projet » (le serveur le revérifie).
export function OffreDossierModal({ slug, projet, offreId, catalogue, onClose, onEnregistre }: Props) {
  const [objet, setObjet] = useState('');
  const [lignes, setLignes] = useState<LigneForm[]>([ligneVide()]);
  const [charge, setCharge] = useState(!offreId);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!offreId) return;
    let annule = false;
    getDevis(slug, offreId)
      .then((d) => {
        if (annule) return;
        setObjet(d.objet);
        setLignes(lignesDepuisDevis(d.lignes));
        setCharge(true);
      })
      .catch(() => {
        if (!annule) setErreur('Impossible de charger l’offre.');
      });
    return () => {
      annule = true;
    };
  }, [slug, offreId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !envoi) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, envoi]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const saisie = lignesSaisies(lignes, catalogue, projet.nbPlanches);
    if ('erreur' in saisie) return setErreur(saisie.erreur);

    setEnvoi(true);
    try {
      if (offreId) {
        await majDevis(slug, offreId, { objet: objet.trim(), lignes: saisie.lignes });
      } else {
        await creerDevis(slug, {
          clientId: projet.client.id,
          dossierCrmId: projet.id,
          objet: objet.trim() || undefined,
          lignes: saisie.lignes,
        });
      }
      onEnregistre();
      onClose();
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'L’enregistrement a échoué.');
      setEnvoi(false);
    }
  }

  async function supprimer() {
    if (!offreId || !window.confirm('Supprimer ce brouillon d’offre ?')) return;
    setEnvoi(true);
    try {
      await supprimerDevis(slug, offreId);
      onEnregistre();
      onClose();
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'La suppression a échoué.');
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !envoi && onClose()}>
      <div
        className="modal modal--large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titre-offre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="modal-titre-offre">
            {offreId ? 'Modifier l’offre' : 'Préparer l’offre'} — {projet.code}
          </h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <form className="modal-body" onSubmit={enregistrer}>
          <p className="field-aide">
            Client : <strong>{projet.client.nom}</strong> · {projet.nbPlanches} planche
            {projet.nbPlanches > 1 ? 's' : ''} (fiche du dossier). L’offre partira au client quand la
            DAF validera le dossier, valable 7 jours.
          </p>

          {!charge ? (
            <p className="field-aide">Chargement…</p>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Objet (facultatif)</span>
                <input
                  className="field-input"
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  placeholder={`ex : Honoraires de conception — ${projet.programme}`}
                  maxLength={200}
                />
              </label>
              <LignesDevisEditeur
                lignes={lignes}
                onChange={setLignes}
                catalogue={catalogue}
                planchesImposees={projet.nbPlanches}
                categorieCo={projet.categorieConception}
                surfaceParDefaut={projet.surfaceTerrain}
              />
              {projet.nbPlanches < 1 && (
                <p className="field-aide">
                  Ce dossier n’a pas de nombre de planches : une ligne de conception (CO) ne peut
                  pas se calculer.
                </p>
              )}
            </>
          )}

          {erreur && <p className="field-erreur">{erreur}</p>}

          <div className="modal-actions">
            {offreId && (
              <button
                type="button"
                className="btn-ghost btn-ghost--danger"
                onClick={supprimer}
                disabled={envoi}
              >
                Supprimer le brouillon
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={envoi || !charge}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
