'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, Copy } from 'lucide-react';
import { formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  creerAbonnementAgenda,
  getAbonnementAgenda,
  lienGoogleAgenda,
  lienWebcal,
  supprimerAbonnementAgenda,
  type EtatAbonnementAgenda,
} from '@/lib/agenda';
import { useConfirmer } from '@/components/confirmation';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';

// « Ajouter à mon agenda » (12/11/2026) : un lien personnel que Google
// Agenda, Apple Calendrier ou Outlook relisent, pour retrouver l'Agenda du HUB
// dans son agenda habituel. Le serveur ne garde que l'empreinte du lien : il
// ne s'affiche qu'à sa création ; perdu, on en génère un nouveau.
export function AbonnementAgendaModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const confirmer = useConfirmer();
  const [etat, setEtat] = useState<EtatAbonnementAgenda | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  useEffect(() => {
    getAbonnementAgenda(slug)
      .then(setEtat)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Abonnement indisponible.'));
  }, [slug]);

  async function generer() {
    if (
      etat?.actif &&
      !(await confirmer({
        titre: 'Générer un nouveau lien ?',
        message: 'L’ancien lien cesse aussitôt de fonctionner : il faudra ajouter le nouveau dans votre agenda.',
        confirmer: 'Générer',
      }))
    )
      return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await creerAbonnementAgenda(slug);
      setUrl(r.url);
      setEtat({ actif: true, creeLe: new Date().toISOString(), dernierAccesLe: null });
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le lien n’a pas été créé.');
    } finally {
      setEnvoi(false);
    }
  }

  async function desactiver() {
    if (
      !(await confirmer({
        titre: 'Désactiver le lien ?',
        message: 'Votre agenda ne recevra plus les éléments du HUB. Vous pourrez en créer un nouveau plus tard.',
        confirmer: 'Désactiver',
        danger: true,
      }))
    )
      return;
    setEnvoi(true);
    setErreur(null);
    try {
      await supprimerAbonnementAgenda(slug);
      setUrl(null);
      setEtat({ actif: false, creeLe: null, dernierAccesLe: null });
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le lien n’a pas été désactivé.');
    } finally {
      setEnvoi(false);
    }
  }

  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setCopie(false), 2000);
    } catch {
      window.prompt('Copiez le lien :', texte);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="abonnement-titre">
      <header className="modal-header">
        <h2 id="abonnement-titre">
          <CalendarPlus size={18} aria-hidden /> Afficher dans Google, Apple ou Outlook
        </h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <div className="modal-body agenda-abonnement">
        <p>
          Vos rendez-vous, réunions, échéances et absences du HUB apparaissent dans votre agenda habituel (Google
          Agenda, Apple Calendrier, Outlook), sur tous vos appareils.
        </p>
        <ul className="agenda-abonnement-notes">
          <li>On crée et on modifie toujours dans le HUB : votre agenda les affiche seulement.</li>
          <li>
            Google Agenda relit le lien toutes les quelques heures (parfois une journée) ; Apple et Outlook, plus
            souvent. Les invitations aux réunions arrivent aussi par e-mail, tout de suite.
          </li>
          <li>Ce lien est personnel : ne le partagez pas.</li>
        </ul>

        {!etat && !erreur ? (
          <Skeleton size="sm" />
        ) : url ? (
          <div className="agenda-abonnement-lien">
            <div className="agenda-abonnement-copie">
              <input
                className="field-input"
                readOnly
                value={url}
                aria-label="Lien de votre agenda"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="btn-ghost" onClick={() => copier(url)} aria-live="polite">
                {copie ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {copie ? 'Copié' : 'Copier'}
              </button>
            </div>
            <div className="agenda-abonnement-boutons">
              <a className="btn-primary" href={lienGoogleAgenda(url)} target="_blank" rel="noopener noreferrer">
                Google Agenda
              </a>
              <a className="btn-ghost" href={lienWebcal(url)}>
                Apple · iPhone · Outlook
              </a>
            </div>
            <p className="agenda-detail">
              Ce lien ne s’affiche qu’une fois. Une autre application d’agenda : collez-le dans « Ajouter un agenda par
              URL ».
            </p>
          </div>
        ) : etat?.actif ? (
          <p className="agenda-abonnement-etat">
            Lien actif depuis le {formatDateTime(etat.creeLe!)}.{' '}
            {etat.dernierAccesLe
              ? `Dernière lecture par votre agenda : ${formatDateTime(etat.dernierAccesLe)}.`
              : 'Votre agenda ne l’a pas encore lu.'}{' '}
            Pour l’ajouter sur un autre appareil, générez un nouveau lien.
          </p>
        ) : null}

        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          {etat?.actif && (
            <button type="button" className="btn-ghost" onClick={desactiver} disabled={envoi}>
              Désactiver
            </button>
          )}
          {etat && (
            <button type="button" className={url ? 'btn-ghost' : 'btn-primary'} onClick={generer} disabled={envoi}>
              {envoi ? 'Un instant…' : etat.actif ? 'Générer un nouveau lien' : 'Créer mon lien'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
