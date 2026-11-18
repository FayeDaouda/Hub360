'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarSync, Plus, RefreshCw } from 'lucide-react';
import { formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  activerConnexion,
  AGENDAS_IMPORTES_MAX,
  afficherAgendaExterne,
  choisirCibleAgenda,
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
  google: 'Compte Google relié. Choisissez les agendas à afficher dans le HUB.',
  annulee: 'La connexion à Google Agenda a été annulée.',
  echec: 'La connexion à Google Agenda n’a pas abouti : réessayez.',
};
// Comptes reliés au plus par personne (même borne que l'API).
const COMPTES_MAX = 5;

// Agendas connectés (16/11/2026 ; plusieurs comptes le 18/11/2026) : ses
// comptes Google (perso, pro…), chacun activé ou en pause ; dans chacun, les
// agendas affichés dans le HUB (effet immédiat) ; et, tous comptes confondus,
// le seul agenda où le HUB écrit ses réunions. Apple suit (lot C2).
export function AgendasConnectes({
  slug,
  resultat: resultatInitial,
  ticket,
  onClose,
  onChange,
}: {
  slug: string;
  resultat?: string | null; // retour de Google (?connexion=…)
  ticket?: string; // à confirmer par la session (?connexion=confirmer#ticket=…)
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

  async function agir(action: () => Promise<EtatConnexions>) {
    setEnvoi(true);
    setErreur(null);
    try {
      setEtat(await action());
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

  async function deconnecter(c: ConnexionAgenda) {
    const ok = await confirmer({
      titre: `Déconnecter ${c.compte} ?`,
      message:
        'Ses rendez-vous quittent le HUB et les réunions que le HUB avait écrites dans cet agenda en sont retirées. Pour une simple pause, utilisez plutôt l’interrupteur.',
      confirmer: 'Déconnecter',
      danger: true,
    });
    if (ok) await agir(() => deconnecterAgenda(slug, c.id));
  }

  const connexions = etat?.connexions ?? [];
  // Où le HUB peut écrire : un agenda à soi, d'un compte actif.
  const cibles = connexions
    .filter((c) => c.active)
    .flatMap((c) => c.agendas.filter((a) => a.proprietaire).map((a) => ({ ...a, compte: c.compte })));
  const cible = connexions.flatMap((c) => c.agendas).find((a) => a.cible)?.id ?? '';
  const peutConnecter = !!etat?.disponibles.google && connexions.length < COMPTES_MAX;

  return (
    <Modal
      onClose={onClose}
      busy={envoi}
      portal
      labelledBy="agendas-connectes-titre"
      className="agenda-connexions-fenetre"
    >
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
          Vos rendez-vous personnels apparaissent dans votre Agenda du HUB (vous seul en voyez le titre ; vos collègues
          voient « occupé »), et vos réunions du HUB s’écrivent dans l’agenda de votre choix, à jour dans les deux sens
          toutes les 5 minutes.
        </p>

        {!etat && !erreur ? (
          <Skeleton size="sm" />
        ) : etat && !etat.disponibles.google && !connexions.length ? (
          <p>La connexion à Google Agenda sera proposée dès qu’elle aura été activée sur ce HUB.</p>
        ) : (
          <>
            {connexions.map((c) => (
              <Compte
                key={c.id}
                connexion={c}
                envoi={envoi}
                onActiver={(active) => agir(() => activerConnexion(slug, c.id, active))}
                onAfficher={(agendaId, importe) => agir(() => afficherAgendaExterne(slug, c.id, agendaId, importe))}
                onSynchroniser={() => agir(() => synchroniserConnexion(slug, c.id))}
                onDeconnecter={() => deconnecter(c)}
              />
            ))}

            {peutConnecter && (
              <button type="button" className="agenda-connexion-ajouter" onClick={connecter} disabled={envoi}>
                <Plus size={18} aria-hidden />
                {connexions.length ? 'Connecter un autre compte Google' : 'Connecter Google Agenda'}
              </button>
            )}
            {connexions.length >= COMPTES_MAX && <p className="agenda-detail">{COMPTES_MAX} comptes reliés au plus.</p>}

            {connexions.length > 0 && (
              <label className="agenda-connexion-cible">
                <span>
                  <strong>Où le HUB écrit vos réunions</strong>
                  <span className="agenda-detail">
                    Un seul agenda, tous comptes confondus (jamais de doublon), et seulement un agenda à vous.
                  </span>
                </span>
                <select
                  className="field-input"
                  value={cible}
                  disabled={envoi}
                  onChange={(e) => agir(() => choisirCibleAgenda(slug, e.target.value || null))}
                >
                  <option value="">Nulle part</option>
                  {cibles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nom} · {a.compte}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <p className="agenda-detail">Apple Calendrier (iCloud) : bientôt.</p>
        {erreur && <FieldError>{erreur}</FieldError>}
      </div>
    </Modal>
  );
}

// Un compte relié : son interrupteur, ses agendas à afficher, ses actions.
function Compte({
  connexion: c,
  envoi,
  onActiver,
  onAfficher,
  onSynchroniser,
  onDeconnecter,
}: {
  connexion: ConnexionAgenda;
  envoi: boolean;
  onActiver: (active: boolean) => void;
  onAfficher: (agendaId: string, importe: boolean) => void;
  onSynchroniser: () => void;
  onDeconnecter: () => void;
}) {
  const affiches = c.agendas.filter((a) => a.importe).length;
  return (
    <section className={`agenda-connexion${c.active ? '' : ' is-pause'}`} aria-label={`Google Agenda · ${c.compte}`}>
      <div className="agenda-connexion-tete">
        <span className="agenda-connexion-logo" aria-hidden>
          G
        </span>
        <span className="agenda-connexion-compte">
          <strong>{c.compte}</strong>
          <span className="agenda-detail">
            {!c.active
              ? 'En pause : rien ne se synchronise.'
              : c.derniereSynchroLe
                ? `Synchronisé le ${formatDateTime(c.derniereSynchroLe)}`
                : 'Première synchronisation en cours…'}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={c.active}
          aria-label={`${c.compte} : synchronisation ${c.active ? 'activée' : 'en pause'}`}
          title={c.active ? 'Mettre en pause' : 'Réactiver'}
          className={`mod-switch${c.active ? ' is-on' : ''}`}
          disabled={envoi}
          onClick={() => onActiver(!c.active)}
        />
      </div>
      {c.erreur && c.active && <FieldError>{c.erreur}</FieldError>}
      {c.active && (
        <fieldset className="agenda-connexion-agendas">
          <legend className="sr-only">Agendas de {c.compte} affichés dans le HUB</legend>
          {c.agendas.map((a) => (
            <label key={a.id} className="agenda-cote-choix">
              <input
                type="checkbox"
                checked={a.importe}
                disabled={envoi || (!a.importe && affiches >= AGENDAS_IMPORTES_MAX)}
                onChange={(e) => onAfficher(a.id, e.target.checked)}
                aria-label={`Afficher ${a.nom} dans le HUB`}
              />
              <span
                className="agenda-cote-pastille"
                style={{ ['--ton' as string]: a.couleur ?? 'var(--ag-externe)' }}
                aria-hidden
              />
              <span className="agenda-connexion-nom">{a.nom}</span>
              {a.cible && <span className="agenda-connexion-badge">Le HUB y écrit</span>}
            </label>
          ))}
        </fieldset>
      )}
      <div className="agenda-connexion-actions">
        {c.active && (
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={onSynchroniser} disabled={envoi}>
            <RefreshCw size={14} aria-hidden /> Synchroniser
          </button>
        )}
        <button type="button" className="btn-ghost btn-ghost--sm" onClick={onDeconnecter} disabled={envoi}>
          Déconnecter
        </button>
      </div>
    </section>
  );
}
