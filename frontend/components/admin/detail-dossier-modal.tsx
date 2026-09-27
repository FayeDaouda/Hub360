'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Localite,
  type Personne,
  type ProduitService,
  type Projet,
} from '@/lib/types';
import { formatSurface } from '@/lib/format';
import type { ActionCrm } from '@/lib/cycle-crm';
import type { OffreEmise } from '@/lib/crm';
import { CycleDossier } from './cycle-dossier';
import { OffreDossier } from './offre-dossier';
import { ContratDossier } from './contrat-dossier';
import { OffreDossierModal } from './offre-dossier-modal';
import { LocaliteSelect } from './localite-select';

type Props = {
  slug: string;
  projet: Projet;
  localites: Localite[] | null;
  proprietaires: Personne[] | null; // titulaires Dir. GC
  peutEcrire: boolean; // crm ≥ écriture : rattachement de localité
  peutReassigner: boolean;
  peutPreparerOffre: boolean; // finances_devis ≥ écriture
  catalogue: ProduitService[];
  onMaj: () => Promise<void>; // recharge le dossier (après une action sur l'offre)
  onClose: () => void;
  // Rejeter la promesse garde le panneau d'action ouvert + affiche l'erreur.
  onAgir: (action: ActionCrm, commentaire?: string) => Promise<OffreEmise | null>;
  // Rejeter la promesse garde le bloc ouvert + affiche l'erreur en ligne.
  onRattacher: (localiteId: string) => Promise<void>;
  onChangerProprietaire: (proprietaireId: string) => Promise<void>;
};

function libelleCommission(taux: number | null): string {
  return taux === null ? 'Aucune' : `${String(taux).replace('.', ',')} %`;
}

// Détail d'un dossier CRM — seul endroit où il avance dans le cycle
// (actions + confirmation, cf. CycleDossier), jamais au fil d'une liste.
export function DetailDossierModal({
  slug,
  projet,
  localites,
  proprietaires,
  peutEcrire,
  peutReassigner,
  peutPreparerOffre,
  catalogue,
  onMaj,
  onClose,
  onAgir,
  onRattacher,
  onChangerProprietaire,
}: Props) {
  // Lien public émis (validation DAF / relance) : le clair n'existe qu'une
  // fois, affiché jusqu'à fermeture.
  const [lienEmis, setLienEmis] = useState<OffreEmise | null>(null);
  // Modale d'offre : undefined = fermée ; { offreId } = brouillon / création.
  const [edition, setEdition] = useState<{ offreId?: string } | undefined>(undefined);
  const [reassignation, setReassignation] = useState(false);
  const [erreurProprio, setErreurProprio] = useState<string | null>(null);

  async function reassigner(id: string) {
    if (!id || id === projet.proprietaire?.id) return;
    setReassignation(true);
    setErreurProprio(null);
    try {
      await onChangerProprietaire(id);
    } catch (e) {
      setErreurProprio(e instanceof Error && e.message ? e.message : 'La réassignation a échoué.');
    } finally {
      setReassignation(false);
    }
  }

  const [localiteId, setLocaliteId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function rattacher() {
    if (!localiteId) return setErreur('Choisis une localité dans la liste.');
    setEnCours(true);
    setErreur(null);
    try {
      await onRattacher(localiteId);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'Le rattachement a échoué.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop modal-backdrop--feuille" onClick={onClose}>
      <div
        className="modal modal--feuille"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-dossier-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="detail-dossier-titre">{projet.code}</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="modal-body">
          <CycleDossier
            slug={slug}
            projet={projet}
            onAgir={async (action, commentaire) => {
              const emise = await onAgir(action, commentaire);
              if (emise) setLienEmis(emise);
            }}
          />
          <OffreDossier
            slug={slug}
            projet={projet}
            peutPreparer={peutPreparerOffre}
            onPreparer={(offreId) => setEdition({ offreId })}
            onMaj={onMaj}
            lienEmis={lienEmis}
            onLienEmis={setLienEmis}
          />
          <ContratDossier
            slug={slug}
            projet={projet}
            peutPreparer={peutPreparerOffre}
            onMaj={onMaj}
          />

          <div className="detail-dossier-grille">
            <div className="field">
              <span className="field-label">Programme</span>
              <span className="detail-dossier-valeur">{projet.programme}</span>
            </div>
            <div className="field">
              <span className="field-label">Client</span>
              <span className="detail-dossier-valeur">
                {projet.client.nom}
                <span className="pill pill--neutre">{TYPES_CLIENT[projet.client.type]}</span>
              </span>
            </div>
            <div className="field">
              <span className="field-label">Nature</span>
              <span className="detail-dossier-valeur">
                <span className={`pill pill--nature-${projet.nature}`}>
                  {NATURES_DOSSIER[projet.nature]}
                </span>
                <span className="cell-sub">{CATEGORIES[projet.categorie]}</span>
              </span>
            </div>
            <div className="field">
              <span className="field-label">Type</span>
              <span className="detail-dossier-valeur">{TYPES_BIEN[projet.type]}</span>
            </div>
            <div className="field">
              <span className="field-label">Localisation</span>
              <span className="detail-dossier-valeur">
                {projet.localisation}
                {projet.localite ? (
                  <span className="pill pill--neutre" title={projet.localite.nom}>
                    {projet.localite.code}
                  </span>
                ) : (
                  <span className="pill pill--attention">Non rattachée</span>
                )}
              </span>
            </div>
            <div className="field">
              <span className="field-label">Surface terrain</span>
              <span className="detail-dossier-valeur">
                {formatSurface(projet.surfaceTerrain)}
              </span>
            </div>
            <div className="field">
              <span className="field-label">Planches</span>
              <span className="detail-dossier-valeur">{projet.nbPlanches || '—'}</span>
            </div>
            <div className="field">
              <span className="field-label">Standing</span>
              <span className="detail-dossier-valeur">{STANDINGS[projet.standing]}</span>
            </div>
            <div className="field">
              <span className="field-label">Gamme</span>
              <span className="detail-dossier-valeur">{GAMMES[projet.gamme]}</span>
            </div>
            <div className="field">
              <span className="field-label">Apporteur d’affaire</span>
              <span className="detail-dossier-valeur">
                {!projet.apporteur ? (
                  <span className="cell-sub">Non renseigné</span>
                ) : projet.apporteur.type === 'interne' ? (
                  <>
                    {projet.apporteur.utilisateur?.nom ?? 'Compte supprimé'}
                    <span className="pill pill--neutre">Interne</span>
                  </>
                ) : (
                  <>
                    {projet.apporteur.nom}
                    <span className="pill pill--neutre">Externe</span>
                    {(projet.apporteur.telephone || projet.apporteur.email) && (
                      <span className="cell-sub">
                        {[projet.apporteur.telephone, projet.apporteur.email]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            {/* Clé absente = pas le droit finances_charges : rien à afficher. */}
            {'commissionApporteur' in projet && (
              <div className="field">
                <span className="field-label">Commission apporteur</span>
                <span className="detail-dossier-valeur">
                  {libelleCommission(projet.commissionApporteur ?? null)}
                </span>
              </div>
            )}
            <div className="field">
              <span className="field-label">Créé par</span>
              <span className="detail-dossier-valeur">
                {projet.creePar?.nom ?? <span className="cell-sub">Non renseigné</span>}
              </span>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="detail-proprietaire">
                Propriétaire
              </label>
              {peutReassigner && proprietaires && proprietaires.length > 0 ? (
                <select
                  id="detail-proprietaire"
                  className="field-input"
                  value={projet.proprietaire?.id ?? ''}
                  disabled={reassignation}
                  onChange={(e) => reassigner(e.target.value)}
                >
                  {!projet.proprietaire && <option value="">À assigner…</option>}
                  {proprietaires.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="detail-dossier-valeur">
                  {projet.proprietaire?.nom ?? (
                    <span className="pill pill--attention">À assigner</span>
                  )}
                </span>
              )}
              {erreurProprio && <p className="field-erreur">{erreurProprio}</p>}
            </div>
          </div>

          {/* Dossier antérieur au référentiel : rattachement manuel, une seule
              fois. Le code et le libellé historique restent tels quels. */}
          {!projet.localite && peutEcrire && (
            <div className="field-bloc">
              <label className="field-label" htmlFor="rattacher-localite">
                Rattacher au référentiel des localités
              </label>
              <span className="field-aide">
                Libellé saisi à la création : « {projet.localisation} ». Le code du dossier ne
                change pas.
              </span>
              <LocaliteSelect
                localites={localites}
                valeur={localiteId}
                onChange={setLocaliteId}
                idChamp="rattacher-localite"
              />
              {erreur && <p className="field-erreur">{erreur}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={enCours || !localiteId}
                  onClick={rattacher}
                >
                  {enCours ? 'Rattachement…' : 'Rattacher'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {edition && (
        <OffreDossierModal
          slug={slug}
          projet={projet}
          offreId={edition.offreId}
          catalogue={catalogue}
          onClose={() => setEdition(undefined)}
          onEnregistre={() => void onMaj()}
        />
      )}
    </div>
  );
}
