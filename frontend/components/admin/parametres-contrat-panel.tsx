'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  ajouterAnnexeGabarit,
  getParametresContrat,
  majParametresContrat,
  retirerAnnexeGabarit,
} from '@/lib/contrats';
import type { ParametresContrat } from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';

// Réglages des contrats de la société (étape G) — societe_admin ou CIO.
// Tout est vide au départ : le texte du contrat et le signataire viennent de
// la société, jamais inventés ; tant qu'ils manquent, la préparation d'un
// contrat refuse en disant quoi renseigner.
export function ParametresContratPanel({ slug }: { slug: string }) {
  const confirmer = useConfirmer();
  const [p, setP] = useState<ParametresContrat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [modele, setModele] = useState('');
  const [nom, setNom] = useState('');
  const [fonction, setFonction] = useState('');
  const [ceoNom, setCeoNom] = useState('');
  const [ceoFonction, setCeoFonction] = useState('');
  const [seuil, setSeuil] = useState('');
  const [nouvelleAnnexe, setNouvelleAnnexe] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  function remplir(x: ParametresContrat) {
    setP(x);
    setModele(x.modele ?? '');
    setNom(x.signataireNom ?? '');
    setFonction(x.signataireFonction ?? '');
    setCeoNom(x.signataireCeoNom ?? '');
    setCeoFonction(x.signataireCeoFonction ?? '');
    setSeuil(x.seuilSurMesureHt != null ? String(x.seuilSurMesureHt) : '');
  }

  useEffect(() => {
    let annule = false;
    setP(null);
    setErreur(null);
    getParametresContrat(slug)
      .then((x) => {
        if (!annule) remplir(x);
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les réglages.');
      });
    return () => {
      annule = true;
    };
  }, [slug, essai]);

  async function agir(fn: () => Promise<ParametresContrat>, succes = false) {
    setEnCours(true);
    setErreur(null);
    setEnregistre(false);
    try {
      remplir(await fn());
      if (succes) setEnregistre(true);
    } catch (e) {
      setErreur(e instanceof ApiError || e instanceof Error ? e.message : 'L’enregistrement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  if (erreur && !p) {
    return (
      <div className="dash-erreur" role="alert">
        <p>{erreur}</p>
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setEssai((n) => n + 1)}>
          <RefreshCw size={15} aria-hidden />
          <span>Réessayer</span>
        </button>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="admin-skeleton" aria-hidden>
        <div className="skeleton admin-skeleton-panel" />
      </div>
    );
  }

  return (
    <>
      <section className="panel glass-panel foncier-groupe">
        <h3 className="panel-title">Modèle de contrat</h3>
        <p className="field-aide">
          Texte fourni par la société. Les champs entre doubles accolades sont remplis à la
          génération ; un champ inconnu est refusé. Au-dessus du seuil ci-dessous, le contrat est
          rédigé sur mesure et déposé à la place.
        </p>
        <textarea
          className="field-input contrat-modele-saisie"
          rows={14}
          value={modele}
          onChange={(e) => setModele(e.target.value)}
          placeholder="Collez ici le texte du contrat-type de la société…"
        />
        <details className="contrat-apercu">
          <summary>Champs disponibles</summary>
          <ul className="contrat-variables">
            {p.variables.map((v) => (
              <li key={v.cle}>
                <code>{`{{${v.cle}}}`}</code> — {v.description}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="panel glass-panel foncier-groupe">
        <h3 className="panel-title">Signataires et seuil</h3>
        <p className="field-aide">
          Le signataire pour la société dépend du montant TTC de l’offre acceptée et du seuil de contresignature
          (Réglages › Règles et délais) : au-delà, seul le CEO contresigne ; en deçà, l’Architecte DPLG.
        </p>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Signataire jusqu’au seuil (Architecte DPLG)</span>
            <input className="field-input" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} placeholder="Nom et prénom" />
          </label>
          <label className="field">
            <span className="field-label">Fonction</span>
            <input className="field-input" value={fonction} onChange={(e) => setFonction(e.target.value)} maxLength={120} placeholder="ex : Architecte DPLG" />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Signataire au-delà du seuil (CEO)</span>
            <input className="field-input" value={ceoNom} onChange={(e) => setCeoNom(e.target.value)} maxLength={120} placeholder="Nom et prénom" />
          </label>
          <label className="field">
            <span className="field-label">Fonction</span>
            <input className="field-input" value={ceoFonction} onChange={(e) => setCeoFonction(e.target.value)} maxLength={120} placeholder="ex : Directeur général" />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Contrat sur mesure à partir de (offre HT, FCFA)</span>
          <input
            className="field-input"
            type="number"
            min="0"
            value={seuil}
            onChange={(e) => setSeuil(e.target.value)}
            placeholder="Vide = toujours depuis le modèle"
          />
        </label>
        {erreur && <p className="field-erreur">{erreur}</p>}
        {enregistre && <p className="field-aide">Réglages enregistrés.</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={enCours}
            onClick={() =>
              agir(
                () =>
                  majParametresContrat(slug, {
                    modele,
                    signataireNom: nom,
                    signataireFonction: fonction,
                    signataireCeoNom: ceoNom,
                    signataireCeoFonction: ceoFonction,
                    seuilSurMesureHt: seuil === '' ? null : Math.round(Number(seuil)),
                  }),
                true,
              )
            }
          >
            Enregistrer
          </button>
        </div>
      </section>

      <section className="panel glass-panel foncier-groupe">
        <h3 className="panel-title">Annexes du contrat</h3>
        <p className="field-aide">
          Proposées à chaque contrat : jointes (fichier) ou marquées « non nécessaire ». L’offre
          acceptée est toujours jointe d’office.
        </p>
        <ul className="foncier-liste">
          {p.annexes.map((a) => (
            <li key={a.id} className="foncier-item">
              <div className="foncier-item-tete">
                <span className="foncier-item-libelle">
                  {a.libelle}
                  {a.automatique && <span className="cell-sub">jointe d’office</span>}
                </span>
                {!a.automatique && (
                  <button
                    type="button"
                    className="doc-icone doc-icone--danger"
                    disabled={enCours}
                    aria-label={`Retirer « ${a.libelle} »`}
                    title="Retirer"
                    onClick={async () => {
                      if (
                        await confirmer({
                          titre: `Retirer « ${a.libelle} » ?`,
                          message: 'Les contrats déjà préparés la gardent.',
                          confirmer: 'Retirer',
                          danger: true,
                        })
                      ) {
                        void agir(() => retirerAnnexeGabarit(slug, a.id));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="foncier-item-actions" style={{ marginTop: '0.8rem' }}>
          <input
            type="text"
            className="field-input"
            placeholder="Nouvelle annexe…"
            value={nouvelleAnnexe}
            maxLength={120}
            onChange={(e) => setNouvelleAnnexe(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            disabled={enCours || !nouvelleAnnexe.trim()}
            onClick={async () => {
              await agir(() => ajouterAnnexeGabarit(slug, nouvelleAnnexe.trim()));
              setNouvelleAnnexe('');
            }}
          >
            <Plus size={14} aria-hidden /> Ajouter
          </button>
        </div>
      </section>
    </>
  );
}
