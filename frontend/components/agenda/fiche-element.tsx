'use client';

import { Bell, CalendarClock, MapPin, Users, Video } from 'lucide-react';
import { formatTime, formatWeekdayDayMonth } from '@hub/domain';
import { LIBELLES_REPONSE, RAPPELS, type ElementAgenda, type ReponseInvitation } from '@/lib/agenda';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { useConfirmer } from '@/components/confirmation';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { TONS } from './grille-horaire';

// Lien visio affichable : https seulement, avec son site (en punycode).
export function siteVisio(lien: string | null): { href: string; site: string } | null {
  if (!lien) return null;
  try {
    const u = new URL(lien);
    return u.protocol === 'https:' && !u.username ? { href: u.href, site: u.hostname } : null;
  } catch {
    return null;
  }
}

export const LIBELLES: Record<ElementAgenda['type'], string> = {
  rendez_vous: 'Rendez-vous',
  echeance: 'Échéance',
  conge: 'Absence',
  demande: 'À décider',
};

// Fiche d'un élément de l'Agenda (12/11/2026), ouverte d'un clic dans la
// grille ou le planning : le détail, et ce qu'on peut en faire — modifier ou
// annuler son rendez-vous, décider une demande d'absence.
export function FicheElement({
  e,
  onClose,
  onModifier,
  onAnnuler,
  onDecider,
  onRepondre,
}: {
  e: ElementAgenda;
  onClose: () => void;
  onModifier: (e: ElementAgenda) => void;
  onAnnuler: (e: ElementAgenda) => void;
  onDecider: (e: ElementAgenda) => void;
  // Son invitation (pas celle d'un collègue superposé) : Oui / Non / Peut-être.
  onRepondre?: (e: ElementAgenda, reponse: ReponseInvitation) => void;
}) {
  const confirmer = useConfirmer();
  const avec = e.invites.length > 0;
  // Son invitation, sur une réunion pas encore terminée.
  const invite =
    e.type === 'rendez_vous' &&
    !e.jeSuisOrganisateur &&
    !e.calque &&
    !!onRepondre &&
    (!e.fin || new Date(e.fin) > new Date());
  // Lien visio : https seulement (défense en profondeur), son site affiché
  // à côté du bouton (un lien trompeur se voit).
  const visio = siteVisio(e.lienVisio);
  const rappel = RAPPELS.find((r) => r.minutes === e.rappelMinutes);

  async function annuler() {
    const ok = await confirmer({
      titre: 'Annuler ce rendez-vous ?',
      message: avec
        ? 'Les invités sont prévenus, dans le HUB et par e-mail : la réunion disparaît de leur agenda.'
        : 'Il disparaît de votre agenda.',
      confirmer: 'Annuler le rendez-vous',
      annuler: 'Garder',
      danger: true,
    });
    if (ok) onAnnuler(e);
  }

  return (
    <Modal onClose={onClose} portal labelledBy="fiche-agenda-titre">
      <header className="modal-header">
        <h2 id="fiche-agenda-titre" className="agenda-fiche-titre">
          <Pill tone={TONS[e.type]}>{LIBELLES[e.type]}</Pill>
          <span>{e.titre}</span>
        </h2>
        <CloseButton onClick={onClose} />
      </header>
      <div className="modal-body agenda-fiche">
        {e.calque && (
          <p className="agenda-fiche-ligne">
            <span
              className="agenda-cote-pastille"
              style={{ ['--ton' as string]: `var(--${e.calque.couleur})` }}
              aria-hidden
            />
            <span>Agenda de {e.calque.nom}</span>
          </p>
        )}
        <p className="agenda-fiche-ligne">
          <CalendarClock size={16} aria-hidden />
          <span>
            {formatWeekdayDayMonth(e.jour)}
            {e.debut && e.fin ? ` · ${formatTime(e.debut)} – ${formatTime(e.fin)}` : ' · toute la journée'}
          </span>
        </p>
        {e.lieu && (
          <p className="agenda-fiche-ligne">
            <MapPin size={16} aria-hidden /> <span>{e.lieu}</span>
          </p>
        )}
        {visio && (
          <p className="agenda-fiche-ligne">
            <Video size={16} aria-hidden />
            <a className="btn-primary btn-primary--sm" href={visio.href} target="_blank" rel="noopener noreferrer">
              Rejoindre la visio
            </a>
            <span className="agenda-detail">{visio.site}</span>
          </p>
        )}
        {rappel && (
          <p className="agenda-fiche-ligne">
            <Bell size={16} aria-hidden /> <span>Rappel {rappel.libelle.toLowerCase()}</span>
          </p>
        )}
        {avec && (
          <div className="agenda-fiche-ligne">
            <Users size={16} aria-hidden />
            <div className="agenda-participants">
              {e.organisateur && <span>Organisé par {e.organisateur}</span>}
              <ul>
                {e.participants.map((p, i) => (
                  <li key={`${p.nom}-${i}`}>
                    <span>{p.nom}</span>
                    <span className={`agenda-reponse is-${p.reponse ?? 'attente'}`}>
                      {p.reponse ? LIBELLES_REPONSE[p.reponse] : 'Sans réponse'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {invite && (
          <div className="agenda-ma-reponse" role="group" aria-label="Votre réponse">
            <span>Vous venez ?</span>
            {(['oui', 'peut_etre', 'non'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`btn-ghost btn-ghost--sm${e.maReponse === r ? ' is-active' : ''}`}
                aria-pressed={e.maReponse === r}
                onClick={() => onRepondre?.(e, r)}
              >
                {LIBELLES_REPONSE[r]}
              </button>
            ))}
          </div>
        )}
        {e.demande && (
          <p className="agenda-fiche-ligne">
            {LIBELLE_TYPE_ABSENCE[e.demande.type]} · {e.demande.jours} j
            {e.demande.validationFinale ? ' · validation finale' : ''}
          </p>
        )}
        {e.detail && <p className="agenda-fiche-note">{e.detail}</p>}
        {e.entretien && (
          <p className="agenda-detail">
            Un entretien se replanifie ou s’annule depuis le recrutement, sur sa candidature.
          </p>
        )}
        <div className="modal-actions">
          {e.annulable && (
            <button type="button" className="btn-ghost" onClick={annuler}>
              Annuler le rendez-vous
            </button>
          )}
          {e.modifiable && (
            <button type="button" className="btn-primary" onClick={() => onModifier(e)}>
              Modifier
            </button>
          )}
          {e.demande && (
            <button type="button" className="btn-primary" onClick={() => onDecider(e)}>
              Décider
            </button>
          )}
          {!e.annulable && !e.modifiable && !e.demande && (
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
