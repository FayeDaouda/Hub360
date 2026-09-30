'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import {
  CATEGORIES,
  GAMMES,
  STANDINGS,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Localite,
  type Personne,
  type ProduitService,
  type Projet,
  type StatutCrm,
  type TransitionDossier,
} from '@/lib/types';
import { formatNombre } from '@/lib/format';
import type { ActionCrm } from '@/lib/cycle-crm';
import { completudeFiche, getHistorique, type OffreEmise } from '@/lib/crm';
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

const jjmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// Situation (maquette du boss) : quatre étapes ; « Perdu » les laisse grisées.
const ETAPES: { statut: StatutCrm; libelle: string }[] = [
  { statut: 'nouveau_projet', libelle: 'Nouveau projet' },
  { statut: 'en_validation', libelle: 'Validation CFO' },
  { statut: 'offre_envoyee', libelle: 'Offre envoyée' },
  { statut: 'onboard', libelle: 'Onboard' },
];

// Une ligne d'historique lisible par transition du cycle.
function libelleTransition(t: TransitionDossier): string {
  const par = t.par?.nom ? ` par ${t.par.nom}` : '';
  const motif = t.commentaire ? ` : ${t.commentaire}` : '';
  if (!t.de) return `Fiche créée${par}`;
  if (t.vers === 'en_validation') return `Offre soumise au CFO${par}`;
  if (t.de === 'en_validation' && t.vers === 'offre_envoyee') return `Offre validée par le CFO, envoyée au client`;
  if (t.de === 'en_validation' && t.vers === 'nouveau_projet') return `Renvoyée par le CFO${motif}`;
  if (t.de === 'offre_envoyee' && t.vers === 'nouveau_projet') return `Offre reprise (expirée sans réponse)`;
  if (t.vers === 'onboard') return `Contrat signé : projet onboard`;
  if (t.vers === 'perdu') return `Dossier perdu${motif}`;
  return `${t.de} → ${t.vers}${par}`;
}

// Fiche d'un dossier CRM en panneau latéral (maquette du boss) : situation,
// champs de la fiche, apporteur, passation, historique, puis les actions du
// cycle (offre, contrat, validation) — seul endroit où le dossier avance.
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
  const [historique, setHistorique] = useState<TransitionDossier[] | null>(null);
  const [localiteId, setLocaliteId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Rechargé à chaque changement de statut (nouvelle ligne de journal).
  useEffect(() => {
    getHistorique(slug, projet.id)
      .then(setHistorique)
      .catch(() => setHistorique([]));
  }, [slug, projet.id, projet.statut]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);

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

  const completude = completudeFiche(projet);
  const rang = ETAPES.findIndex((e) => e.statut === projet.statut);
  const ap = projet.apporteur;
  const manquant = (texte = 'à renseigner') => <span className="crm-manquant">{texte}</span>;

  const champs: { libelle: string; valeur: React.ReactNode; aide: string }[] = [
    { libelle: 'Code projet', valeur: projet.code, aide: 'Généré : initiales client _ localité . année' },
    {
      libelle: 'Catégorie',
      valeur: projet.nature === 'promotion_interne' ? 'Développement' : CATEGORIES[projet.categorie],
      aide: 'Conception, Développement ou Aménagement',
    },
    {
      libelle: 'Localisation',
      valeur: projet.localite ? `${projet.localite.nom} (${projet.localite.code})` : manquant(`${projet.localisation} · non rattachée`),
      aide: 'Choisie dans le référentiel des localités',
    },
    { libelle: 'Type de projet', valeur: TYPES_BIEN[projet.type] ?? manquant(), aide: 'Liste déroulante' },
    {
      libelle: 'Surface du terrain',
      valeur: projet.surfaceTerrain > 0 ? `${formatNombre(projet.surfaceTerrain)} m²` : manquant(),
      aide: 'Fiche Programme · base du calcul de surface vendue',
    },
    { libelle: 'N° de planches', valeur: projet.nbPlanches > 0 ? projet.nbPlanches : manquant(), aide: 'Une planche = un plan-type, pas un étage' },
    { libelle: 'Client', valeur: projet.client.nom, aide: TYPES_CLIENT[projet.client.type] },
    { libelle: 'Standing', valeur: STANDINGS[projet.standing] ?? manquant(), aide: 'Ce que le bâtiment offre' },
    { libelle: 'Gamme', valeur: GAMMES[projet.gamme] ?? manquant(), aide: 'Avec quoi on le finit' },
    { libelle: 'Programme', valeur: projet.programme.trim() || manquant('Fiche Programme à remplir'), aide: 'Résumé de la fiche Programme' },
  ];

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <aside
        className="fiche-crm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-crm-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fiche-crm-entete">
          <div>
            <h2 id="fiche-crm-titre" className="fiche-crm-code">
              {projet.code}
            </h2>
            <p className="fiche-crm-client">{projet.client.nom}</p>
            <p className="fiche-crm-meta">
              {TYPES_CLIENT[projet.client.type]} · {projet.localite?.nom ?? projet.localisation} · créé le {jjmmaaaa(projet.creeLe)}
            </p>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <section className="fiche-crm-section">
          <h3 className="fiche-crm-titre">Situation</h3>
          <ol className={`fiche-crm-etapes${projet.statut === 'perdu' ? ' is-perdu' : ''}`}>
            {ETAPES.map((e, i) => (
              <li key={e.statut} className={i < rang ? 'is-fait' : i === rang ? 'is-courant' : undefined}>
                {e.libelle}
              </li>
            ))}
          </ol>
          {projet.statut === 'perdu' && <p className="fiche-crm-note">Dossier perdu : le cycle est clos.</p>}
          {projet.offreExpiree && <p className="fiche-crm-note">Offre expirée sans réponse du client.</p>}
        </section>

        {projet.statut === 'nouveau_projet' && completude.faits < completude.total && (
          <div className="fiche-crm-alerte" role="note">
            <strong>
              Fiche {completude.faits}/{completude.total} : il manque {completude.manquants.join(', ')}
            </strong>
            <span>Le bouton « Créer une offre » reste bloqué tant que la fiche n’est pas complète.</span>
          </div>
        )}

        <section className="fiche-crm-section">
          <div className="fiche-crm-titre-ligne">
            <h3 className="fiche-crm-titre">Les champs de la fiche</h3>
            {projet.verrouillee && <span className="fiche-crm-badge">Verrouillé depuis l’émission de l’offre</span>}
          </div>
          <dl className="fiche-crm-champs">
            {champs.map((c) => (
              <div key={c.libelle}>
                <dt>{c.libelle}</dt>
                <dd>
                  <span className="fiche-crm-valeur">{c.valeur}</span>
                  <span className="fiche-crm-aide">{c.aide}</span>
                </dd>
              </div>
            ))}
          </dl>
          {!projet.localite && peutEcrire && (
            <div className="field-bloc">
              <label className="field-label" htmlFor="rattacher-localite">
                Rattacher au référentiel des localités
              </label>
              <span className="field-aide">
                Libellé saisi à la création : « {projet.localisation} ». Le code du dossier ne change pas.
              </span>
              <LocaliteSelect localites={localites} valeur={localiteId} onChange={setLocaliteId} idChamp="rattacher-localite" />
              {erreur && <p className="field-erreur">{erreur}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-primary" disabled={enCours || !localiteId} onClick={rattacher}>
                  {enCours ? 'Rattachement…' : 'Rattacher'}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="fiche-crm-section">
          <div className="fiche-crm-titre-ligne">
            <h3 className="fiche-crm-titre">Fiche apporteur d’affaire</h3>
            <span className="fiche-crm-badge fiche-crm-badge--ok">Validée · verrouillée</span>
          </div>
          <div className="fiche-crm-carte">
            {!ap ? (
              <strong>Aucun apporteur · affaire directe</strong>
            ) : (
              <dl className="fiche-crm-apporteur">
                <div>
                  <dt>Nom et prénom</dt>
                  <dd>{ap.type === 'interne' ? ap.utilisateur?.nom ?? 'Compte supprimé' : ap.nom}</dd>
                </div>
                <div>
                  <dt>Relation</dt>
                  <dd>{ap.type === 'interne' ? 'Apporteur interne' : 'Apporteur externe'}</dd>
                </div>
                {'commissionApporteur' in projet && (
                  <div>
                    <dt>% attribué</dt>
                    <dd className="fiche-crm-pourcent">{projet.commissionApporteur == null ? '—' : `${formatNombre(projet.commissionApporteur)} %`}</dd>
                  </div>
                )}
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
                  <dd>{jjmmaaaa(projet.creeLe)}</dd>
                </div>
              </dl>
            )}
            <p className="fiche-crm-aide">Établie et validée d’office à la création. Non modifiable, y compris par l’administrateur.</p>
          </div>
        </section>

        <section className="fiche-crm-section">
          <h3 className="fiche-crm-titre">Passation de la fiche</h3>
          <div className="fiche-crm-passation">
            <div className="fiche-crm-carte">
              <span className="fiche-crm-aide">Créée par</span>
              <strong>{projet.creePar?.nom ?? 'Non renseigné'}</strong>
              <span className="fiche-crm-aide">automatique, non modifiable</span>
            </div>
            <ArrowRight size={18} strokeWidth={2} aria-hidden className="fiche-crm-fleche" />
            <div className="fiche-crm-carte fiche-crm-carte--proprio">
              <span className="fiche-crm-aide">Propriétaire</span>
              {peutReassigner && proprietaires && proprietaires.length > 0 ? (
                <select
                  className="field-input"
                  aria-label="Propriétaire de la fiche"
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
                <strong>{projet.proprietaire?.nom ?? 'À assigner'}</strong>
              )}
              <span className="fiche-crm-aide">pilote la fiche jusqu’au contrat</span>
            </div>
          </div>
          {erreurProprio && <p className="field-erreur">{erreurProprio}</p>}
        </section>

        <section className="fiche-crm-section">
          <h3 className="fiche-crm-titre">Historique</h3>
          {!historique ? (
            <div className="skeleton admin-skeleton-panel admin-skeleton-panel--sm" aria-hidden />
          ) : historique.length === 0 ? (
            <p className="fiche-crm-aide">Aucun événement enregistré.</p>
          ) : (
            <ol className="fiche-crm-historique">
              {historique.map((t) => (
                <li key={t.id}>
                  <time>{jjmmaaaa(t.le)}</time>
                  <span>{libelleTransition(t)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="fiche-crm-section fiche-crm-actions">
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
          <ContratDossier slug={slug} projet={projet} peutPreparer={peutPreparerOffre} onMaj={onMaj} />
        </section>
      </aside>
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
