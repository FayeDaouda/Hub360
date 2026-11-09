'use client';

import { useEffect, useRef, useState } from 'react';
import { creerProjet } from '@/lib/crm';
import { getSession } from '@/lib/auth';
import { libelleRole } from '@/lib/groupe';
import { LocaliteSelect } from './localite-select';
import {
  FicheApporteurChamps,
  SAISIE_APPORTEUR_VIDE,
  versApporteurSaisi,
  type SaisieApporteur,
} from './fiche-apporteur-champs';
import { segmentClient } from '@/lib/nomenclature';
import type { Client, Localite, NouveauProjetPayload, Personne, Projet, TypeClient } from '@/lib/types';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { yearOf } from '@hub/domain';
import { FieldError } from '@/components/ui/field';

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

// « Nouveau projet » (maquette du boss, oct. 2026) : le client, sa nature, la
// localité et la fiche apporteur, rien d'autre — le code se compose sous les
// yeux. Type, terrain, planches, standing, gamme et programme se complètent
// ensuite sur la fiche (relance du HUB au-delà de 72 h).
export function NouveauProjetModal({ slug, clients, localites, proprietaires, onClose, onCree }: Props) {
  const [clientId, setClientId] = useState(NOUVEAU_CLIENT);
  const [morale, setMorale] = useState(false);
  const [nom, setNom] = useState('');
  const [localiteId, setLocaliteId] = useState('');
  const [apporteur, setApporteur] = useState<SaisieApporteur>(SAISIE_APPORTEUR_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Lue une fois : la session ne change pas pendant la vie de la modale.
  const [session] = useState(getSession);
  const champNom = useRef<HTMLInputElement>(null);

  const clientNouveau = clientId === NOUVEAU_CLIENT;
  const clientExistant = clientNouveau ? null : (clients.find((c) => c.id === clientId) ?? null);
  // Personne morale : stockée « entreprise » (le détail SCI / institution se
  // règle sur la fiche client) ; seule la règle du code en dépend.
  const typeNouveau: TypeClient = morale ? 'entreprise' : 'particulier';
  const localite = localites?.find((l) => l.id === localiteId) ?? null;

  // Aperçu du code, segment par segment (« ??? » tant qu'il manque) — le
  // -2/-3 éventuel est tranché par le serveur, qui connaît les codes pris.
  const segment = clientNouveau
    ? segmentClient({ nom, type: typeNouveau })
    : clientExistant
      ? segmentClient(clientExistant)
      : '';
  const code = `${segment || '???'}_${localite?.code ?? '???'}.${String(yearOf()).slice(-2)}`;

  const apporteurSaisi = versApporteurSaisi(apporteur);
  const clientSaisi = clientNouveau ? !!nom.trim() : !!clientExistant;
  const blocage = !clientSaisi
    ? 'Saisir le client pour continuer'
    : !localiteId
      ? 'Choisir la localisation pour continuer'
      : !apporteurSaisi
        ? 'Compléter la fiche apporteur pour continuer'
        : null;

  // Passation : le rôle du créateur, puis qui pilotera la fiche (le Dir. GC
  // propriétaire, choisi d'office par le serveur s'il est seul).
  const moi = session?.utilisateur.id;
  const pilote = proprietaires?.length === 1 ? proprietaires[0] : null;
  const passation =
    proprietaires === null
      ? '…'
      : pilote?.id === moi
        ? 'Vous créez et pilotez la fiche.'
        : pilote
          ? `${pilote.nom} (Direction GC) pilote ensuite la fiche jusqu’au contrat.`
          : 'Propriétaire à assigner ensuite sur la fiche (Direction GC).';

  // Focus sur le nom à l'ouverture seulement (la page parente se réaffiche
  // en passant un nouveau onClose : le focus ne doit pas y revenir).
  useEffect(() => {
    champNom.current?.focus();
  }, []);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (blocage || !apporteurSaisi) return;
    setErreur(null);
    const payload: NouveauProjetPayload = {
      // Verrouillé sur Mandat client (demande boss, sept. 2026) : Promotion
      // interne reste dans l'enum mais n'est pas proposée à la création.
      nature: 'mandat_client',
      localiteId,
      client: clientNouveau ? { nouveau: { nom: nom.trim(), type: typeNouveau } } : { id: clientId },
      apporteur: apporteurSaisi,
    };
    setEnvoi(true);
    try {
      onCree(await creerProjet(slug, payload));
      onClose();
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : 'La création a échoué. Réessaie.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} trapFocus className="nouveau-projet" labelledBy="modal-titre">
      <ModalHeader title="Nouveau projet" titleId="modal-titre" onClose={onClose} closeDisabled={envoi} />

      {/* Deux colonnes (identité du projet, affaire) qui défilent ; le pied,
          avec ce qui manque et « Créer le projet », reste visible (08/11/2026). */}
      <form className="nouveau-projet-form" onSubmit={soumettre}>
        <div className="modal-body nouveau-projet-corps">
          <div className="nouveau-projet-colonne">
            <div className="nouveau-projet-code">
              <span className="nouveau-projet-surtitre">Code projet généré</span>
              <strong className="nouveau-projet-code-valeur" aria-live="polite">
                {code}
              </strong>
              <span>Le code se compose au fur et à mesure de la saisie.</span>
            </div>

            <div className="field">
              <label className="field-label nouveau-projet-label" htmlFor="nouveau-projet-client">
                Client
              </label>
              <select
                id="nouveau-projet-client"
                className="field-input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value={NOUVEAU_CLIENT}>+ Nouveau client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <span className="field-aide">
                Un client existant garde sa fiche, ses contacts et son adresse ; le nouveau projet s’y rattache.
              </span>
            </div>

            {clientNouveau && (
              <>
                <div className="field">
                  <span className="field-label nouveau-projet-label" id="nouveau-projet-nature">
                    Nature du client
                  </span>
                  <div className="nouveau-projet-nature" role="radiogroup" aria-labelledby="nouveau-projet-nature">
                    {[false, true].map((m) => (
                      <button
                        key={String(m)}
                        type="button"
                        role="radio"
                        aria-checked={morale === m}
                        className={morale === m ? 'is-actif' : undefined}
                        onClick={() => setMorale(m)}
                      >
                        {m ? 'Personne morale' : 'Personne physique'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="field-label nouveau-projet-label" htmlFor="nouveau-projet-nom">
                    {morale ? 'Raison sociale' : 'Prénom(s) et nom'}
                  </label>
                  <input
                    ref={champNom}
                    id="nouveau-projet-nom"
                    className="field-input"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder={morale ? 'ex. SCI Les Filaos' : 'ex. Dior Fall Sourang'}
                    maxLength={160}
                  />
                  <span className="field-aide">
                    {morale
                      ? 'Les initiales ignorent les mots de liaison et la forme juridique (SA, SARL…).'
                      : 'Dans l’ordre de l’état civil : une lettre par prénom et par nom.'}
                  </span>
                </div>
              </>
            )}

            <div className="field">
              <label className="field-label nouveau-projet-label" htmlFor="nouveau-projet-localite">
                Localisation
              </label>
              <LocaliteSelect
                localites={localites}
                valeur={localiteId}
                onChange={setLocaliteId}
                idChamp="nouveau-projet-localite"
              />
              <span className="field-aide">
                Choisie dans le référentiel des localités. Le code{localite ? ` (ici ${localite.code})` : ''} n’est
                jamais tapé à la main.
              </span>
            </div>
          </div>

          <div className="nouveau-projet-colonne">
            <div
              className={`fiche-apporteur${apporteur.aucun ? ' is-directe' : ''}`}
              role="group"
              aria-labelledby="nouveau-projet-apporteur"
            >
              <p className="fiche-apporteur-titre" id="nouveau-projet-apporteur">
                <strong>Fiche apporteur d’affaire</strong> (obligatoire · validée et verrouillée à la création)
              </p>
              <FicheApporteurChamps saisie={apporteur} onChange={setApporteur} idPrefixe="nouveau-projet-apporteur" />
              <span className="field-aide">Après création, seul le COO pourra modifier cette fiche.</span>
            </div>

            <div className="nouveau-projet-passation">
              <span className="nouveau-projet-surtitre">Créée par (automatique)</span>
              <strong>{session ? libelleRole(session.role) : '—'}</strong>
              <span>{passation}</span>
            </div>

            <p className="field-aide nouveau-projet-suite">
              Les autres champs (type, terrain, planches, standing, gamme, programme) se complètent ensuite dans la
              fiche, par listes déroulantes, sous 72 h. Au-delà, le HUB crée une relance.
            </p>
          </div>
        </div>

        <footer className="nouveau-projet-pied">
          <div id="nouveau-projet-etat" className="nouveau-projet-etat" role="status">
            {erreur ? (
              <FieldError>{erreur}</FieldError>
            ) : blocage ? (
              <span>{blocage}</span>
            ) : (
              <span className="nouveau-projet-pret">Tout est prêt : le code sera réservé à la création.</span>
            )}
          </div>
          <div className="nouveau-projet-boutons">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button
              type="submit"
              className={`btn-primary nouveau-projet-valider${blocage ? ' is-bloque' : ''}`}
              disabled={!!blocage || envoi}
              aria-describedby="nouveau-projet-etat"
            >
              {envoi ? 'Création…' : 'Créer le projet'}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
