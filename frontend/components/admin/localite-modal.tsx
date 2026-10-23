'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { proposerCodeLocalite } from '@/lib/localites';
import {
  LIBELLE_REGION_LOCALITE,
  ZONES_LOCALITE,
  type Localite,
  type NouvelleLocalitePayload,
  type ZoneLocalite,
} from '@/lib/types';

type Props = {
  localites: Localite[]; // référentiel complet — contrôle d'unicité en direct
  localite?: Localite; // absent = création
  zoneInitiale: ZoneLocalite;
  // Rejeter la promesse garde la modale ouverte + affiche l'erreur en ligne
  // (ex : 409 serveur si le code a été pris entre-temps).
  onSubmit: (payload: NouvelleLocalitePayload) => Promise<void>;
  onClose: () => void;
};

const FORMAT_CODE = /^[A-Z]{3}$/;

// Création / modification d'une localité (direction uniquement). Le code est
// proposé à partir du nom tant que la direction n'y a pas touché ; toute
// collision est signalée en direct, jamais corrigée d'office — c'est à la
// direction de choisir un autre code (règle validée, sept. 2026).
export function LocaliteModal({
  localites,
  localite,
  zoneInitiale,
  onSubmit,
  onClose,
}: Props) {
  const edition = !!localite;
  const [zone, setZone] = useState<ZoneLocalite>(localite?.zone ?? zoneInitiale);
  const [nom, setNom] = useState(localite?.nom ?? '');
  const [region, setRegion] = useState(localite?.region ?? '');
  const [arrondissement, setArrondissement] = useState(localite?.arrondissement ?? '');
  const [commune, setCommune] = useState(localite?.commune ?? '');
  const [code, setCode] = useState(localite?.code ?? '');
  // Tant que false, le code suit le nom (proposition automatique).
  const [codeTouche, setCodeTouche] = useState(edition);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const premierChamp = useRef<HTMLInputElement>(null);

  const codeFige = !!localite?.codeVerrouille;
  const detenteur = localites.find((l) => l.code === code && l.id !== localite?.id);
  const formatOk = FORMAT_CODE.test(code);
  const regionsConnues = [
    ...new Set(localites.filter((l) => l.zone === zone).map((l) => l.region)),
  ];

  useEffect(() => {
    premierChamp.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enCours) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enCours]);

  function changerNom(valeur: string) {
    setNom(valeur);
    if (!codeTouche) setCode(proposerCodeLocalite(valeur));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return setErreur('Le nom est requis.');
    if (!region.trim()) return setErreur(`Le champ « ${LIBELLE_REGION_LOCALITE[zone]} » est requis.`);
    if (!formatOk) return setErreur('Le code doit faire exactement 3 lettres.');
    if (detenteur) return setErreur(`Le code ${code} est déjà pris : choisis-en un autre.`);

    setEnCours(true);
    setErreur(null);
    try {
      await onSubmit({
        code,
        nom: nom.trim(),
        zone,
        region: region.trim(),
        arrondissement: zone === 'dakar' ? arrondissement.trim() || null : null,
        commune: commune.trim() || null,
      });
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'Enregistrement impossible.');
      setEnCours(false);
    }
  }

  return (
    <div className="modal-backdrop modal-backdrop--feuille" onClick={() => !enCours && onClose()}>
      <div
        className="modal modal--feuille"
        role="dialog"
        aria-modal="true"
        aria-labelledby="localite-modal-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="localite-modal-titre">
            {edition ? `Modifier ${localite.nom}` : 'Nouvelle localité'}
          </h2>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="modal-body" onSubmit={soumettre}>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Onglet</span>
              <select
                className="field-input"
                value={zone}
                disabled={edition}
                onChange={(e) => {
                  setZone(e.target.value as ZoneLocalite);
                  setRegion('');
                }}
              >
                {(Object.keys(ZONES_LOCALITE) as ZoneLocalite[]).map((z) => (
                  <option key={z} value={z}>
                    {ZONES_LOCALITE[z]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Nom</span>
              <input
                ref={premierChamp}
                className="field-input"
                value={nom}
                onChange={(e) => changerNom(e.target.value)}
                placeholder="ex : Point E"
                maxLength={120}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">{LIBELLE_REGION_LOCALITE[zone]}</span>
              <input
                className="field-input"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                list="localite-regions"
                maxLength={120}
              />
              <datalist id="localite-regions">
                {regionsConnues.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            {zone === 'dakar' ? (
              <label className="field">
                <span className="field-label">Arrondissement (facultatif)</span>
                <input
                  className="field-input"
                  value={arrondissement}
                  onChange={(e) => setArrondissement(e.target.value)}
                  maxLength={120}
                />
              </label>
            ) : (
              <span aria-hidden />
            )}
          </div>

          <label className="field">
            <span className="field-label">Commune de rattachement (facultatif)</span>
            <input
              className="field-input"
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              placeholder="ex : Fann-Point E-Amitié"
              maxLength={120}
            />
            <span className="field-aide">
              Pour un quartier d’usage qui fait partie d’une commune administrative.
            </span>
          </label>

          <label className="field">
            <span className="field-label">Code (3 lettres)</span>
            <input
              className="field-input localite-code-input"
              value={code}
              disabled={codeFige}
              maxLength={3}
              autoComplete="off"
              aria-invalid={!!detenteur || (code !== '' && !formatOk)}
              onChange={(e) => {
                setCodeTouche(true);
                setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
              }}
            />
            {codeFige ? (
              <span className="field-aide localite-code-aide">
                <Lock size={12} aria-hidden />
                Déjà utilisé par au moins un dossier : ce code ne peut plus changer.
              </span>
            ) : detenteur ? (
              <span className="field-erreur">
                Déjà pris par « {detenteur.nom} » ({ZONES_LOCALITE[detenteur.zone]}) — choisis un
                autre code.
              </span>
            ) : (
              <span className="field-aide">
                {code && formatOk
                  ? `${code} est libre.`
                  : 'Proposé à partir des 3 premières lettres du nom, modifiable.'}
              </span>
            )}
          </label>

          {erreur && <p className="field-erreur">{erreur}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours || !!detenteur}>
              {enCours ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
