'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { creerProjet } from '@/lib/crm';
import { aLaPermission, getSession } from '@/lib/auth';
import { LocaliteSelect } from './localite-select';
import { estPersonneMorale, genererCodeDossier, normaliserSigle } from '@/lib/nomenclature';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Categorie,
  type Client,
  type Gamme,
  type Localite,
  type NatureDossier,
  type NouveauProjetPayload,
  PAS_COMMISSION,
  type Personne,
  type Projet,
  type Standing,
  type TypeBien,
  type TypeClient,
} from '@/lib/types';

const NOUVEAU_CLIENT = '__nouveau__';

type Props = {
  slug: string;
  clients: Client[];
  localites: Localite[] | null; // null = chargement en cours
  // Titulaires Dir. GC (propriétaires possibles) ; null = chargement.
  proprietaires: Personne[] | null;
  onClose: () => void;
  onCree: (projet: Projet) => void;
};

// Petit helper pour les <select> pilotés par un Record<clé, libellé>.
function options<T extends string>(map: Record<T, string>) {
  return (Object.keys(map) as T[]).map((cle) => (
    <option key={cle} value={cle}>
      {map[cle]}
    </option>
  ));
}

export function NouveauProjetModal({
  slug,
  clients,
  localites,
  proprietaires,
  onClose,
  onCree,
}: Props) {
  // Verrouillé sur Mandat client (demande boss, sept. 2026) : Promotion
  // interne reste dans l'enum côté schéma (pas une suppression) mais n'est
  // plus proposée à la création tant que la consigne n'est pas levée.
  const nature: NatureDossier = 'mandat_client';
  const [categorie, setCategorie] = useState<Categorie>('conception');
  const [localiteId, setLocaliteId] = useState('');
  const [type, setType] = useState<TypeBien>('villa');
  const [nbPlanches, setNbPlanches] = useState('');
  const [surfaceTerrain, setSurfaceTerrain] = useState('');
  const [programme, setProgramme] = useState('');
  const [standing, setStanding] = useState<Standing>('moyen');
  const [gamme, setGamme] = useState<Gamme>('milieu');
  const [clientId, setClientId] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauType, setNouveauType] = useState<TypeClient>('particulier');
  const [nouveauContact, setNouveauContact] = useState('');
  const [nouveauEmail, setNouveauEmail] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');
  // Sigle d'une nouvelle personne morale, ou d'une existante qui n'en a pas.
  const [sigle, setSigle] = useState('');

  // Apporteur d'affaire : interne = moi (le créateur), externe = tiers.
  const [apporteurType, setApporteurType] = useState<'interne' | 'externe'>('interne');
  const [apporteurNom, setApporteurNom] = useState('');
  const [apporteurTel, setApporteurTel] = useState('');
  const [apporteurEmail, setApporteurEmail] = useState('');
  const [commission, setCommission] = useState(''); // '' = aucune
  const [proprietaireId, setProprietaireId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Lus une fois : la session ne change pas pendant la vie de la modale.
  const [moi] = useState(() => {
    const u = getSession()?.utilisateur;
    return u ? `${u.prenom} ${u.nom}` : 'moi';
  });
  const [peutSaisirCommission] = useState(() => aLaPermission('finances_charges', 'ecriture'));
  const choixProprietaire = (proprietaires?.length ?? 0) > 1;
  const premierChamp = useRef<HTMLInputElement>(null);
  const localite = localites?.find((l) => l.id === localiteId) ?? null;

  const clientNouveau = clientId === NOUVEAU_CLIENT;

  const clientExistant = clientNouveau ? null : clients.find((c) => c.id === clientId) ?? null;
  // Champ sigle : nouvelle personne morale, ou personne morale existante dont
  // la fiche n'a pas encore de sigle (il y sera enregistré).
  const sigleRequis = clientNouveau
    ? estPersonneMorale(nouveauType)
    : !!clientExistant && estPersonneMorale(clientExistant.type) && !clientExistant.sigle;

  // Aperçu du code — toujours généré, jamais saisi (le -2/-3 éventuel est
  // tranché par le serveur, qui connaît les codes déjà pris).
  const apercuCode = genererCodeDossier(
    clientNouveau
      ? { nom: nouveauNom, type: nouveauType, sigle }
      : clientExistant
        ? { ...clientExistant, sigle: clientExistant.sigle || sigle }
        : { nom: '', type: 'particulier' },
    localite?.code ?? '',
  );

  useEffect(() => {
    premierChamp.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!localiteId) return setErreur('Choisis une localité dans la liste.');
    if (categorie === 'conception' && !(Number(nbPlanches) >= 1))
      return setErreur('Le nombre de planches est requis pour un dossier de conception.');
    if (!programme.trim()) return setErreur('Le programme est requis.');
    if (!clientId) return setErreur('Choisis un client (ou crée-en un).');
    if (clientNouveau && !nouveauNom.trim())
      return setErreur('Le nom du nouveau client est requis.');
    if (apporteurType === 'externe' && !apporteurNom.trim())
      return setErreur('Le nom de l’apporteur externe est requis.');
    if (choixProprietaire && !proprietaireId)
      return setErreur('Choisis le propriétaire du dossier.');
    if (sigleRequis && !normaliserSigle(sigle))
      return setErreur('Le sigle est obligatoire pour une société, une SCI ou une institution.');

    const client: NouveauProjetPayload['client'] = clientNouveau
      ? {
          nouveau: {
            nom: nouveauNom.trim(),
            type: nouveauType,
            sigle: sigleRequis ? sigle.trim() : undefined,
            contact: nouveauContact.trim() || undefined,
            email: nouveauEmail.trim() || undefined,
            telephone: nouveauTel.trim() || undefined,
          },
        }
      : { id: clientId, sigle: sigleRequis ? sigle.trim() : undefined };

    setEnvoi(true);
    try {
      const projet = await creerProjet(slug, {
        nature,
        categorie,
        localiteId,
        type,
        nbPlanches: nbPlanches ? Number(nbPlanches) : 0,
        surfaceTerrain: surfaceTerrain ? Number(surfaceTerrain) : 0,
        client,
        standing,
        gamme,
        programme: programme.trim(),
        apporteur:
          apporteurType === 'interne'
            ? { type: 'interne' }
            : {
                type: 'externe',
                nom: apporteurNom.trim(),
                telephone: apporteurTel.trim() || undefined,
                email: apporteurEmail.trim() || undefined,
              },
        commissionApporteur:
          peutSaisirCommission && commission ? Number(commission) : undefined,
        proprietaireId: proprietaireId || undefined,
      });
      onCree(projet);
      onClose();
    } catch (e) {
      setErreur(
        e instanceof Error && e.message ? e.message : 'La création a échoué. Réessaie.',
      );
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="modal-titre">Nouveau projet</h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <form className="modal-body" onSubmit={soumettre}>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Nature</span>
              <select className="field-input" value={nature} disabled>
                {options({ mandat_client: NATURES_DOSSIER.mandat_client })}
              </select>
              <span className="field-hint">Promotion interne temporairement indisponible</span>
            </label>
            <label className="field">
              <span className="field-label">Catégorie</span>
              <select
                className="field-input"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as Categorie)}
              >
                {options(CATEGORIES)}
              </select>
            </label>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="nouveau-projet-localite">
              Localisation
            </label>
            <LocaliteSelect
              localites={localites}
              valeur={localiteId}
              onChange={setLocaliteId}
              idChamp="nouveau-projet-localite"
            />
            <span className="field-aide">
              Absente de la liste ? Demande à la direction de l’ajouter (Paramètres → Localités).
            </span>
          </div>

          <label className="field">
            <span className="field-label">Programme</span>
            <input
              ref={premierChamp}
              className="field-input"
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              placeholder="ex : Les Terrasses de Ngor"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Type</span>
              <select
                className="field-input"
                value={type}
                onChange={(e) => setType(e.target.value as TypeBien)}
              >
                {options(TYPES_BIEN)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Nombre de planches</span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={nbPlanches}
                onChange={(e) => setNbPlanches(e.target.value)}
                placeholder="ex : 3"
              />
              {/* CGV art. 4 — base du tarif de conception (CO). */}
              <span className="field-aide">
                Niveaux distincts à dessiner (des niveaux identiques = 1 planche).
              </span>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Surface terrain (m²)</span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={surfaceTerrain}
                onChange={(e) => setSurfaceTerrain(e.target.value)}
                placeholder="ex : 320"
              />
            </label>
            <label className="field">
              <span className="field-label">Standing</span>
              <select
                className="field-input"
                value={standing}
                onChange={(e) => setStanding(e.target.value as Standing)}
              >
                {options(STANDINGS)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Gamme</span>
              <select
                className="field-input"
                value={gamme}
                onChange={(e) => setGamme(e.target.value as Gamme)}
              >
                {options(GAMMES)}
              </select>
            </label>
            {/* Plus de statut ici : tout dossier naît « Nouveau projet ». */}
            <span aria-hidden />
          </div>

          <label className="field">
            <span className="field-label">Client</span>
            <select
              className="field-input"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setSigle('');
              }}
            >
              <option value="">Choisir…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {TYPES_CLIENT[c.type]}
                </option>
              ))}
              <option value={NOUVEAU_CLIENT}>＋ Nouveau client…</option>
            </select>
          </label>

          {!clientNouveau && sigleRequis && (
            <label className="field">
              <span className="field-label">Sigle du client</span>
              <input
                className="field-input"
                value={sigle}
                onChange={(e) => setSigle(e.target.value.toUpperCase())}
                placeholder="ex : TC"
                maxLength={20}
              />
              <span className="field-aide">
                Cette fiche n’a pas encore de sigle : il y sera enregistré et servira au code.
              </span>
            </label>
          )}

          {clientNouveau && (
            <div className="field-bloc">
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Nom du client</span>
                  <input
                    className="field-input"
                    value={nouveauNom}
                    onChange={(e) => setNouveauNom(e.target.value)}
                    placeholder="ex : SCI Ndiaye Frères"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Type</span>
                  <select
                    className="field-input"
                    value={nouveauType}
                    onChange={(e) => setNouveauType(e.target.value as TypeClient)}
                  >
                    {options(TYPES_CLIENT)}
                  </select>
                </label>
              </div>
              {sigleRequis && (
                <label className="field">
                  <span className="field-label">Sigle</span>
                  <input
                    className="field-input"
                    value={sigle}
                    onChange={(e) => setSigle(e.target.value.toUpperCase())}
                    placeholder="ex : SNF"
                    maxLength={20}
                  />
                  <span className="field-aide">
                    Le sigle que l’entreprise utilise elle-même — il forme le début du code.
                  </span>
                </label>
              )}
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Contact (facultatif)</span>
                  <input
                    className="field-input"
                    value={nouveauContact}
                    onChange={(e) => setNouveauContact(e.target.value)}
                    placeholder="Personne référente"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Téléphone (facultatif)</span>
                  <input
                    className="field-input"
                    value={nouveauTel}
                    onChange={(e) => setNouveauTel(e.target.value)}
                    placeholder="+221…"
                  />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Email (facultatif)</span>
                <input
                  className="field-input"
                  type="email"
                  value={nouveauEmail}
                  onChange={(e) => setNouveauEmail(e.target.value)}
                  placeholder="contact@…"
                />
              </label>
            </div>
          )}

          <div className="field-row">
            <label className="field">
              <span className="field-label">Apporteur d’affaire</span>
              <select
                className="field-input"
                value={apporteurType}
                onChange={(e) => setApporteurType(e.target.value as 'interne' | 'externe')}
              >
                <option value="interne">Moi-même ({moi})</option>
                <option value="externe">Un tiers externe…</option>
              </select>
            </label>
            {peutSaisirCommission ? (
              <label className="field">
                <span className="field-label">Commission apporteur</span>
                <select
                  className="field-input"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                >
                  <option value="">Aucune</option>
                  {PAS_COMMISSION.map((p) => (
                    <option key={p} value={p}>
                      {String(p).replace('.', ',')} %
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span aria-hidden />
            )}
          </div>

          {apporteurType === 'externe' && (
            <div className="field-bloc">
              <label className="field">
                <span className="field-label">Nom de l’apporteur</span>
                <input
                  className="field-input"
                  value={apporteurNom}
                  onChange={(e) => setApporteurNom(e.target.value)}
                  placeholder="ex : Me Aliou Ndiaye (notaire)"
                  maxLength={120}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Téléphone (facultatif)</span>
                  <input
                    className="field-input"
                    value={apporteurTel}
                    onChange={(e) => setApporteurTel(e.target.value)}
                    placeholder="+221…"
                    maxLength={40}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Email (facultatif)</span>
                  <input
                    className="field-input"
                    type="email"
                    value={apporteurEmail}
                    onChange={(e) => setApporteurEmail(e.target.value)}
                    placeholder="contact@…"
                    maxLength={120}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="field">
            <span className="field-label">Propriétaire du dossier</span>
            {proprietaires === null ? (
              <span className="field-aide">Chargement…</span>
            ) : choixProprietaire ? (
              <select
                className="field-input"
                value={proprietaireId}
                onChange={(e) => setProprietaireId(e.target.value)}
                aria-label="Propriétaire du dossier"
              >
                <option value="">Choisir parmi les Dir. GC…</option>
                {proprietaires.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            ) : proprietaires.length === 1 ? (
              <span className="detail-dossier-valeur">{proprietaires[0].nom}</span>
            ) : (
              <span className="detail-dossier-valeur">
                <span className="pill pill--attention">À assigner</span>
              </span>
            )}
            <span className="field-aide">
              {proprietaires?.length === 0
                ? 'Aucun titulaire du rôle Dir. GC : le dossier sera créé « à assigner ».'
                : 'Le responsable Dir. GC qui suit le dossier — réassignable ensuite.'}
            </span>
          </div>

          <div className="field">
            <span className="field-label">Code projet</span>
            <span className="code-apercu">{apercuCode || '—'}</span>
            <span className="field-aide">
              {apercuCode
                ? 'Généré automatiquement (-2, -3… si ce code existe déjà).'
                : 'Généré à partir du client et de la localité — jamais saisi à la main.'}
            </span>
          </div>

          {erreur && <p className="field-erreur">{erreur}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={envoi}>
              {envoi ? 'Création…' : 'Créer le projet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
