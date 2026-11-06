'use client';

import { useEffect, useState } from 'react';
import { Check, LogOut, Pencil, UserPlus, X } from 'lucide-react';
import { stripAccents } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { ajouterMembresGroupe, getMembresGroupe, renommerGroupe, retirerMembreGroupe } from '@/lib/chat';
import type { CanalChat, MembreAnnuaire, PersonneChat } from '@/lib/types';
import { PersonAvatar } from '@/components/ui/avatar';

// Groupes de discussion (01/11/2026) : création (nom + personnes choisies),
// puis la fiche du groupe — membres, ajout, retrait (le créateur), nom (le
// créateur), quitter.
const message = (e: unknown, defaut: string) => (e instanceof ApiError ? e.message : defaut);
const nomDe = (m: MembreAnnuaire) => m.nomAffiche || `${m.prenom} ${m.nom}`;

// Choix de personnes dans l'annuaire, avec recherche.
function ChoixPersonnes({
  annuaire,
  exclus = [],
  choisis,
  onBasculer,
}: {
  annuaire: MembreAnnuaire[];
  exclus?: string[];
  choisis: Set<string>;
  onBasculer: (id: string) => void;
}) {
  const [filtre, setFiltre] = useState('');
  const f = stripAccents(filtre).toLowerCase();
  const liste = annuaire.filter(
    (m) =>
      !exclus.includes(m.utilisateurId) &&
      stripAccents(`${nomDe(m)} ${m.role}`)
        .toLowerCase()
        .includes(f),
  );
  return (
    <>
      <input
        className="field-input pchat-recherche"
        placeholder="Rechercher une personne…"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        aria-label="Rechercher une personne"
      />
      <ul className="pchat-liste pchat-choix">
        {liste.length === 0 && <li className="pchat-vide">Personne.</li>}
        {liste.map((m) => {
          const coche = choisis.has(m.utilisateurId);
          return (
            <li key={m.utilisateurId}>
              <button
                type="button"
                className={`pchat-canal${coche ? ' is-choisi' : ''}`}
                aria-pressed={coche}
                onClick={() => onBasculer(m.utilisateurId)}
              >
                <PersonAvatar name={nomDe(m)} photo={m.photoUrl} colorKey={m.utilisateurId} size="sm" />
                <span className="pchat-canal-nom pchat-canal-nom--annuaire">
                  <span>{nomDe(m)}</span>
                  <span className="pchat-annuaire-role">
                    {m.role}
                    {m.cellule ? ` · ${m.cellule}` : ''}
                  </span>
                </span>
                <span className={`pchat-coche${coche ? ' is-coche' : ''}`} aria-hidden>
                  {coche && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function NouveauGroupe({
  annuaire,
  onCreer,
}: {
  annuaire: MembreAnnuaire[] | null;
  onCreer: (nom: string, membreIds: string[]) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const basculer = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  async function creer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await onCreer(nom.trim(), [...choisis]);
    } catch (e) {
      setErreur(message(e, 'Le groupe n’a pas été créé.'));
      setEnvoi(false);
    }
  }
  return (
    <div className="pchat-groupe">
      <input
        className="field-input"
        placeholder="Nom du groupe (ex. Chantier Ouakam)"
        value={nom}
        maxLength={80}
        onChange={(e) => setNom(e.target.value)}
        aria-label="Nom du groupe"
      />
      {annuaire === null ? (
        <p className="pchat-vide">Chargement…</p>
      ) : (
        <ChoixPersonnes annuaire={annuaire} choisis={choisis} onBasculer={basculer} />
      )}
      {erreur && <p className="pchat-erreur">{erreur}</p>}
      <button
        type="button"
        className="btn-primary pchat-groupe-creer"
        disabled={envoi || nom.trim().length < 2 || choisis.size === 0}
        onClick={creer}
      >
        {envoi ? 'Création…' : `Créer le groupe${choisis.size ? ` · ${choisis.size + 1} personnes` : ''}`}
      </button>
    </div>
  );
}

export function InfosGroupe({
  slug,
  canal,
  moiId,
  annuaire,
  onChargerAnnuaire,
  onQuitter,
  onMaj,
}: {
  slug: string;
  canal: CanalChat;
  moiId: string;
  annuaire: MembreAnnuaire[] | null;
  onChargerAnnuaire: () => void;
  onQuitter: () => void;
  onMaj: () => void;
}) {
  const [membres, setMembres] = useState<PersonneChat[] | null>(null);
  const [ajout, setAjout] = useState(false);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [renommage, setRenommage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const createur = canal.creeParId === moiId;

  useEffect(() => {
    getMembresGroupe(slug, canal.id)
      .then(setMembres)
      .catch((e) => setErreur(message(e, 'Membres indisponibles.')));
  }, [slug, canal.id]);

  async function agir(f: () => Promise<unknown>) {
    setErreur(null);
    try {
      await f();
      setMembres(await getMembresGroupe(slug, canal.id));
      onMaj();
    } catch (e) {
      setErreur(message(e, 'L’action a échoué.'));
    }
  }

  return (
    <div className="pchat-groupe">
      <div className="pchat-groupe-nom">
        {renommage === null ? (
          <>
            <strong>{canal.nom}</strong>
            {createur && (
              <button
                type="button"
                className="pchat-icone"
                aria-label="Renommer le groupe"
                onClick={() => setRenommage(canal.nom)}
              >
                <Pencil size={14} aria-hidden />
              </button>
            )}
          </>
        ) : (
          <form
            className="pchat-renommer"
            onSubmit={(e) => {
              e.preventDefault();
              void agir(() => renommerGroupe(slug, canal.id, renommage)).then(() => setRenommage(null));
            }}
          >
            <input
              className="field-input"
              value={renommage}
              maxLength={80}
              onChange={(e) => setRenommage(e.target.value)}
              aria-label="Nouveau nom"
            />
            <button type="submit" className="pchat-icone" aria-label="Enregistrer le nom">
              <Check size={15} aria-hidden />
            </button>
            <button type="button" className="pchat-icone" aria-label="Annuler" onClick={() => setRenommage(null)}>
              <X size={15} aria-hidden />
            </button>
          </form>
        )}
      </div>

      {ajout ? (
        <>
          {annuaire === null ? (
            <p className="pchat-vide">Chargement…</p>
          ) : (
            <ChoixPersonnes
              annuaire={annuaire}
              exclus={membres?.map((m) => m.id) ?? []}
              choisis={choisis}
              onBasculer={(id) =>
                setChoisis((s) => {
                  const n = new Set(s);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                })
              }
            />
          )}
          <div className="pchat-groupe-actions">
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setAjout(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              disabled={!choisis.size}
              onClick={() =>
                void agir(() => ajouterMembresGroupe(slug, canal.id, [...choisis])).then(() => {
                  setAjout(false);
                  setChoisis(new Set());
                })
              }
            >
              Ajouter {choisis.size || ''}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="pchat-groupe-sous">{membres ? `${membres.length} membres` : 'Chargement…'}</p>
          <ul className="pchat-liste pchat-membres">
            {membres?.map((m) => (
              <li key={m.id}>
                <span className="pchat-canal">
                  <PersonAvatar name={m.nom} photo={m.photoUrl} colorKey={m.id} size="sm" />
                  <span className="pchat-canal-nom pchat-canal-nom--annuaire">
                    <span>
                      {m.nom}
                      {m.id === moiId ? ' (vous)' : ''}
                    </span>
                    {m.createur && <span className="pchat-annuaire-role">Créateur du groupe</span>}
                  </span>
                  {createur && m.id !== moiId && (
                    <button
                      type="button"
                      className="pchat-icone"
                      aria-label={`Retirer ${m.nom} du groupe`}
                      onClick={() => void agir(() => retirerMembreGroupe(slug, canal.id, m.id))}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="pchat-groupe-actions">
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => {
                onChargerAnnuaire();
                setAjout(true);
              }}
            >
              <UserPlus size={14} aria-hidden /> Ajouter des personnes
            </button>
            <button
              type="button"
              className="btn-ghost btn-ghost--sm pchat-quitter"
              onClick={async () => {
                setErreur(null);
                try {
                  await retirerMembreGroupe(slug, canal.id, moiId);
                  onQuitter();
                } catch (e) {
                  setErreur(message(e, 'Impossible de quitter le groupe.'));
                }
              }}
            >
              <LogOut size={14} aria-hidden /> Quitter le groupe
            </button>
          </div>
        </>
      )}
      {erreur && <p className="pchat-erreur">{erreur}</p>}
    </div>
  );
}
