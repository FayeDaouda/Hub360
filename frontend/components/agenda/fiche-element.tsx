'use client';

import { CalendarClock, MapPin, Users } from 'lucide-react';
import { formatTime, formatWeekdayDayMonth } from '@hub/domain';
import type { ElementAgenda } from '@/lib/agenda';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { useConfirmer } from '@/components/confirmation';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/pill';
import { TONS } from './grille-horaire';

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
}: {
  e: ElementAgenda;
  onClose: () => void;
  onModifier: (e: ElementAgenda) => void;
  onAnnuler: (e: ElementAgenda) => void;
  onDecider: (e: ElementAgenda) => void;
}) {
  const confirmer = useConfirmer();
  const avec = e.invites.length > 0;

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
        {avec && (
          <p className="agenda-fiche-ligne">
            <Users size={16} aria-hidden />
            <span>
              Avec {e.invites.join(', ')}
              {e.organisateur ? ` · organisé par ${e.organisateur}` : ''}
            </span>
          </p>
        )}
        {e.demande && (
          <p className="agenda-fiche-ligne">
            {LIBELLE_TYPE_ABSENCE[e.demande.type]} · {e.demande.jours} j
            {e.demande.validationFinale ? ' · validation finale' : ''}
          </p>
        )}
        {e.detail && <p className="agenda-fiche-note">{e.detail}</p>}
        {e.entretien && (
          <p className="agenda-detail">Un entretien se replanifie depuis le recrutement, sur sa candidature.</p>
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
