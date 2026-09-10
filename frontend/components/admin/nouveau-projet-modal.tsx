'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { creerProjet } from '@/lib/crm';
import { genererCodeDossier } from '@/lib/nomenclature';
import {
  CATEGORIES,
  GAMMES,
  NATURES_DOSSIER,
  STANDINGS,
  STATUTS_CRM,
  TYPES_BIEN,
  TYPES_CLIENT,
  type Categorie,
  type Client,
  type Gamme,
  type NatureDossier,
  type NouveauProjetPayload,
  type Projet,
  type Standing,
  type StatutCrm,
  type TypeBien,
  type TypeClient,
} from '@/lib/types';

const NOUVEAU_CLIENT = '__nouveau__';

type Props = {
  slug: string;
  clients: Client[];
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

export function NouveauProjetModal({ slug, clients, onClose, onCree }: Props) {
  const [nature, setNature] = useState<NatureDossier>('mandat_client');
  const [categorie, setCategorie] = useState<Categorie>('conception');
  const [localisation, setLocalisation] = useState('');
  const [type, setType] = useState<TypeBien>('villa');
  const [nbPlanches, setNbPlanches] = useState('');
  const [surfaceTerrain, setSurfaceTerrain] = useState('');
  const [programme, setProgramme] = useState('');
  const [standing, setStanding] = useState<Standing>('moyen');
  const [gamme, setGamme] = useState<Gamme>('milieu');
  const [statut, setStatut] = useState<StatutCrm>('nouveau');
  const [clientId, setClientId] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauType, setNouveauType] = useState<TypeClient>('particulier');
  const [nouveauContact, setNouveauContact] = useState('');
  const [nouveauEmail, setNouveauEmail] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');

  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const premierChamp = useRef<HTMLInputElement>(null);

  const clientNouveau = clientId === NOUVEAU_CLIENT;

  // Aperçu du code auto : dépend du client choisi + de la localisation.
  const clientPourCode = clientNouveau
    ? { nom: nouveauNom, type: nouveauType }
    : clients.find((c) => c.id === clientId) ?? { nom: '', type: 'particulier' };
  const apercuCode = genererCodeDossier(
    { nom: clientPourCode.nom, type: clientPourCode.type },
    localisation,
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

    if (!localisation.trim()) return setErreur('La localisation est requise.');
    if (!programme.trim()) return setErreur('Le programme est requis.');
    if (!clientId) return setErreur('Choisis un client (ou crée-en un).');
    if (clientNouveau && !nouveauNom.trim())
      return setErreur('Le nom du nouveau client est requis.');

    const client: NouveauProjetPayload['client'] = clientNouveau
      ? {
          nouveau: {
            nom: nouveauNom.trim(),
            type: nouveauType,
            contact: nouveauContact.trim() || undefined,
            email: nouveauEmail.trim() || undefined,
            telephone: nouveauTel.trim() || undefined,
          },
        }
      : { id: clientId };

    setEnvoi(true);
    try {
      const projet = await creerProjet(slug, {
        nature,
        categorie,
        localisation: localisation.trim(),
        type,
        nbPlanches: nbPlanches ? Number(nbPlanches) : 0,
        surfaceTerrain: surfaceTerrain ? Number(surfaceTerrain) : 0,
        client,
        standing,
        gamme,
        programme: programme.trim(),
        statut,
        code: code.trim() || undefined,
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
              <select
                className="field-input"
                value={nature}
                onChange={(e) => setNature(e.target.value as NatureDossier)}
              >
                {options(NATURES_DOSSIER)}
              </select>
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

          <label className="field">
            <span className="field-label">Localisation</span>
            <input
              ref={premierChamp}
              className="field-input"
              value={localisation}
              onChange={(e) => setLocalisation(e.target.value)}
              placeholder="ex : Ngor, Dakar"
            />
          </label>

          <label className="field">
            <span className="field-label">Programme</span>
            <input
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
            <label className="field">
              <span className="field-label">Statut</span>
              <select
                className="field-input"
                value={statut}
                onChange={(e) => setStatut(e.target.value as StatutCrm)}
              >
                {options(STATUTS_CRM[nature])}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Client</span>
            <select
              className="field-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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

          <label className="field">
            <span className="field-label">Code projet</span>
            <input
              className="field-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={apercuCode || 'généré automatiquement'}
            />
            <span className="field-aide">
              {code.trim()
                ? 'Code personnalisé — refusé s’il est déjà utilisé.'
                : apercuCode
                  ? `Laissé vide : ${apercuCode} (+ V2, V3… si doublon).`
                  : 'Laissé vide : généré à partir du client et de la localisation.'}
            </span>
          </label>

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
