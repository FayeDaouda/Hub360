'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarSync, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  AGENDAS_IMPORTES_MAX,
  choisirAgendas,
  confirmerGoogle,
  connecterGoogle,
  deconnecterAgenda,
  getConnexions,
  synchroniserConnexion,
  type ConnexionAgenda,
  type EtatConnexions,
} from '@/lib/agenda';
import { useConfirmer } from '@/components/confirmation';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';

const RESULTATS: Record<string, string> = {
  confirmer: 'Connexion de Google Agenda en cours…',
  google: 'Google Agenda est connecté. Choisissez les agendas à afficher et celui où le HUB écrit ses réunions.',
  annulee: 'La connexion à Google Agenda a été annulée.',
  echec: 'La connexion à Google Agenda n’a pas abouti : réessayez.',
};

// Agendas connectés (16/11/2026) : Google Agenda dans les deux sens — ses
// rendez-vous dans le HUB (visibles par soi seul ; « occupé » pour les
// collègues), ses réunions du HUB dans Google. Apple suit (lot C2). Chacun
// choisit les agendas à afficher et celui où le HUB écrit.
export function AgendasConnectes({
  slug,
  resultat: resultatInitial,
  ticket,
  onClose,
  onChange,
}: {
  slug: string;
  resultat?: string | null; // retour de Google (?connexion=…)
  ticket?: string; // à confirmer par la session (?connexion=confirmer&ticket=…)
  onClose: () => void;
  onChange: () => void; // l'Agenda se relit
}) {
  const confirmer = useConfirmer();
  const [etat, setEtat] = useState<EtatConnexions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // « confirmer » sans ticket (adresse abîmée) : rien à confirmer, échec.
  const [resultat, setResultat] = useState(
    resultatInitial === 'confirmer' && !ticket ? 'echec' : (resultatInitial ?? null),
  );

  // Au retour de Google, la session confirme le ticket (une seule fois, même
  // si l'effet est rejoué) ; sinon, simple lecture de l'état.
  const confirme = useRef(false);
  useEffect(() => {
    if (resultatInitial === 'confirmer' && ticket) {
      if (confirme.current) return;
      confirme.current = true;
      confirmerGoogle(slug, ticket)
        .then((e) => {
          setEtat(e);
          setResultat('google');
          onChange();
        })
        .catch((e) => {
          setResultat(null);
          setErreur(e instanceof ApiError ? e.message : 'La connexion à Google Agenda n’a pas abouti : réessayez.');
          getConnexions(slug)
            .then(setEtat)
            .catch(() => undefined);
        });
      return;
    }
    getConnexions(slug)
      .then(setEtat)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Agendas connectés indisponibles.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois à l'ouverture
  }, [slug]);

  async function agir(action: () => Promise<EtatConnexions>, apres?: () => void) {
    setEnvoi(true);
    setErreur(null);
    try {
      setEtat(await action());
      apres?.();
      onChange();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’action n’a pas abouti.');
    } finally {
      setEnvoi(false);
    }
  }

  async function connecter() {
    setEnvoi(true);
    setErreur(null);
    try {
      const { url } = await connecterGoogle(slug);
      window.location.assign(url); // autoriser chez Google, puis retour à l'Agenda
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La connexion n’a pas pu démarrer.');
      setEnvoi(false);
    }
  }

  const google = etat?.connexions.find((c) => c.fournisseur === 'google');
  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="agendas-connectes-titre">
      <header className="modal-header">
        <h2 id="agendas-connectes-titre">
          <CalendarSync size={18} aria-hidden /> Agendas connectés
        </h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body agenda-connexions">
        {resultat && RESULTATS[resultat] && (
          <p className={`agenda-connexion-resultat${resultat === 'google' ? ' is-ok' : ''}`} role="status">
            {RESULTATS[resultat]}
          </p>
        )}
        <p className="agenda-detail">
          Vos rendez-vous Google apparaissent dans votre Agenda du HUB (vous seul en voyez le titre ; vos collègues
          voient « occupé »), et vos réunions du HUB s’écrivent dans votre Google Agenda, à jour dans les deux sens
          toutes les 5 minutes.
        </p>
        {!etat && !erreur ? (
          <Skeleton size="sm" />
        ) : etat && !etat.disponibles.google && !google ? (
          <p>La connexion à Google Agenda sera proposée dès qu’elle aura été activée sur ce HUB.</p>
        ) : google ? (
          <Connexion
            // Nouvel état du serveur (enregistré, resynchronisé) : les choix repartent de lui.
            key={google.agendas.map((a) => `${a.id}:${+a.importe}${+a.cible}`).join(',')}
            connexion={google}
            envoi={envoi}
            onChoisir={(importes, cible) => agir(() => choisirAgendas(slug, google.id, importes, cible))}
            onSynchroniser={() => agir(() => synchroniserConnexion(slug, google.id))}
            onDeconnecter={async () => {
              if (
                await confirmer({
                  titre: 'Déconnecter Google Agenda ?',
                  message:
                    'Vos rendez-vous Google quittent le HUB et les réunions que le HUB avait écrites dans votre Google Agenda en sont retirées.',
                  confirmer: 'Déconnecter',
                  danger: true,
                })
              ) {
                await agir(() => deconnecterAgenda(slug, google.id));
              }
            }}
          />
        ) : (
          <div className="modal-actions agenda-connexion-actions">
            <button type="button" className="btn-primary" onClick={connecter} disabled={envoi}>
              Connecter Google Agenda
            </button>
          </div>
        )}
        <p className="agenda-detail">Apple Calendrier (iCloud) : bientôt.</p>
        {erreur && <FieldError>{erreur}</FieldError>}
      </div>
    </Modal>
  );
}

function Connexion({
  connexion,
  envoi,
  onChoisir,
  onSynchroniser,
  onDeconnecter,
}: {
  connexion: ConnexionAgenda;
  envoi: boolean;
  onChoisir: (importes: string[], cible: string | null) => void;
  onSynchroniser: () => void;
  onDeconnecter: () => void;
}) {
  const [importes, setImportes] = useState(connexion.agendas.filter((a) => a.importe).map((a) => a.id));
  const [cible, setCible] = useState<string | null>(connexion.agendas.find((a) => a.cible)?.id ?? null);
  const change =
    importes.slice().sort().join(',') !==
      connexion.agendas
        .filter((a) => a.importe)
        .map((a) => a.id)
        .sort()
        .join(',') || cible !== (connexion.agendas.find((a) => a.cible)?.id ?? null);
  return (
    <section className="agenda-connexion" aria-label={`Google Agenda · ${connexion.compte}`}>
      <div className="agenda-connexion-tete">
        <strong>Google Agenda</strong>
        <span className="agenda-detail">{connexion.compte}</span>
      </div>
      <p className="agenda-detail">
        {connexion.derniereSynchroLe
          ? `Dernière synchronisation : ${formatDateTime(connexion.derniereSynchroLe)}.`
          : 'Première synchronisation dans quelques minutes.'}
      </p>
      {connexion.erreur && <FieldError>{connexion.erreur}</FieldError>}
      <table className="agenda-connexion-agendas">
        <thead>
          <tr>
            <th scope="col">Agenda</th>
            <th scope="col">Afficher dans le HUB</th>
            <th scope="col">Le HUB y écrit</th>
          </tr>
        </thead>
        <tbody>
          {connexion.agendas.map((a) => (
            <tr key={a.id}>
              <td>
                <span
                  className="agenda-cote-pastille"
                  style={{ ['--ton' as string]: a.couleur ?? undefined }}
                  aria-hidden
                />{' '}
                {a.nom}
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Afficher ${a.nom} dans le HUB`}
                  checked={importes.includes(a.id)}
                  disabled={!importes.includes(a.id) && importes.length >= AGENDAS_IMPORTES_MAX}
                  onChange={() => setImportes((l) => (l.includes(a.id) ? l.filter((x) => x !== a.id) : [...l, a.id]))}
                />
              </td>
              <td>
                <input
                  type="radio"
                  name="agenda-cible"
                  aria-label={
                    a.proprietaire
                      ? `Le HUB écrit ses réunions dans ${a.nom}`
                      : `${a.nom} : agenda partagé, le HUB n’y écrit pas`
                  }
                  title={a.proprietaire ? undefined : 'Agenda partagé avec vous : le HUB n’écrit que dans vos agendas.'}
                  checked={cible === a.id}
                  disabled={!a.proprietaire}
                  onChange={() => setCible(a.id)}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td>Nulle part</td>
            <td />
            <td>
              <input
                type="radio"
                name="agenda-cible"
                aria-label="Le HUB n’écrit ses réunions nulle part"
                checked={cible === null}
                onChange={() => setCible(null)}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {importes.length >= AGENDAS_IMPORTES_MAX && (
        <p className="agenda-detail">{AGENDAS_IMPORTES_MAX} agendas affichés au plus.</p>
      )}
      <div className="modal-actions agenda-connexion-actions">
        <button type="button" className="btn-ghost" onClick={onDeconnecter} disabled={envoi}>
          Déconnecter
        </button>
        <button type="button" className="btn-ghost" onClick={onSynchroniser} disabled={envoi}>
          <RefreshCw size={16} aria-hidden /> Synchroniser maintenant
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onChoisir(importes, cible)}
          disabled={envoi || !change}
        >
          Enregistrer
        </button>
      </div>
    </section>
  );
}
