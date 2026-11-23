'use client';

import { Bell, CalendarClock, MapPin, Pencil, Repeat, Trash2, Users, Video } from 'lucide-react';
import { formatTime, formatWeekdayDayMonth } from '@hub/domain';
import { LIBELLES_REPONSE, RAPPELS, type ElementAgenda, type ReponseInvitation } from '@/lib/agenda';
import type { Rect } from '@/lib/agenda-placement';
import { LIBELLE_TYPE_ABSENCE } from '@/lib/demandes';
import { useConfirmer } from '@/components/confirmation';
import { CloseButton } from '@/components/ui/dialog';
import { PersonAvatar } from '@/components/ui/avatar';
import { FenetreAncree } from './fenetre-ancree';
import { styleCalque, TONS } from './grille-horaire';

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
  externe: 'Google / Apple',
};

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Fiche d'un élément de l'Agenda (12/11/2026 ; façon Google Agenda le
// 18/11/2026) : posée à côté de ce qu'on a cliqué sur ordinateur, en feuille
// sur téléphone. En tête, les actions en icônes (modifier, annuler, fermer) ;
// puis la couleur, le titre, le moment, et le détail ligne par ligne ; on
// répond à son invitation en bas.
export function FicheElement({
  e,
  ancre = null,
  etroit = false,
  onClose,
  onModifier,
  onAnnuler,
  onDecider,
  onRepondre,
}: {
  e: ElementAgenda;
  ancre?: Rect | null;
  etroit?: boolean;
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
  const oui = e.participants.filter((p) => p.reponse === 'oui').length;
  const attente = e.participants.filter((p) => !p.reponse).length;

  async function annuler() {
    // Une série : la page demande la portée (elle tient lieu de confirmation).
    if (e.serieId) return onAnnuler(e);
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
    <FenetreAncree ancre={ancre} etroit={etroit} onClose={onClose} labelledBy="fiche-agenda-titre">
      <div className="agenda-fiche-outils">
        {e.modifiable && (
          <button
            type="button"
            className="agenda-icone-bouton"
            aria-label="Modifier"
            title="Modifier"
            onClick={() => onModifier(e)}
          >
            <Pencil size={17} aria-hidden />
          </button>
        )}
        {e.annulable && (
          <button
            type="button"
            className="agenda-icone-bouton"
            aria-label="Annuler le rendez-vous"
            title="Annuler le rendez-vous"
            onClick={annuler}
          >
            <Trash2 size={17} aria-hidden />
          </button>
        )}
        <CloseButton onClick={onClose} />
      </div>

      <div className="agenda-fiche">
        <div className="agenda-fiche-entete">
          <span
            className={`agenda-fiche-couleur agenda-puce--${TONS[e.type]}${e.calque ? ' is-calque' : ''}`}
            style={styleCalque(e)}
            aria-hidden
          />
          <div className="agenda-fiche-entete-texte">
            <h2 id="fiche-agenda-titre" className="agenda-fiche-titre">
              {e.titre}
            </h2>
            <p className="agenda-fiche-quand">
              {capitale(formatWeekdayDayMonth(e.jour))}
              {e.debut && e.fin ? ` · ${formatTime(e.debut)} – ${formatTime(e.fin)}` : ' · toute la journée'}
            </p>
            {e.regleTexte && (
              <p className="agenda-fiche-quand">
                <Repeat size={13} aria-hidden /> {e.regleTexte}
                {e.occurrenceModifiee ? ' · cette date modifiée' : ''}
              </p>
            )}
            {e.type !== 'rendez_vous' && <span className="agenda-fiche-type">{LIBELLES[e.type]}</span>}
          </div>
        </div>

        {e.calque && (
          <p className="agenda-fiche-ligne">
            <CalendarClock size={18} aria-hidden />
            <span>Agenda de {e.calque.nom}</span>
          </p>
        )}
        {visio && (
          <div className="agenda-fiche-ligne">
            <Video size={18} aria-hidden />
            <div className="agenda-fiche-visio">
              <a className="btn-primary" href={visio.href} target="_blank" rel="noopener noreferrer">
                Rejoindre la visio
              </a>
              <span className="agenda-detail">{visio.site}</span>
            </div>
          </div>
        )}
        {e.lieu && (
          <p className="agenda-fiche-ligne">
            <MapPin size={18} aria-hidden /> <span>{e.lieu}</span>
          </p>
        )}
        {avec && (
          <div className="agenda-fiche-ligne">
            <Users size={18} aria-hidden />
            <div className="agenda-participants">
              <span className="agenda-participants-resume">
                {e.participants.length} participant{e.participants.length > 1 ? 's' : ''}
                <span className="agenda-detail">
                  {oui} oui{attente ? ` · ${attente} en attente` : ''}
                </span>
              </span>
              {e.organisateur && <span className="agenda-detail">Organisé par {e.organisateur}</span>}
              <ul>
                {e.participants.map((p, i) => (
                  <li key={`${p.nom}-${i}`}>
                    <PersonAvatar name={p.nom} size="xs" />
                    <span className="agenda-participant-nom">{p.nom}</span>
                    <span className={`agenda-reponse is-${p.reponse ?? 'attente'}`}>
                      {p.reponse ? LIBELLES_REPONSE[p.reponse] : 'Sans réponse'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {rappel && (
          <p className="agenda-fiche-ligne">
            <Bell size={18} aria-hidden /> <span>Rappel {rappel.libelle.toLowerCase()}</span>
          </p>
        )}
        {e.demande && (
          <p className="agenda-fiche-ligne">
            <CalendarClock size={18} aria-hidden />
            <span>
              {LIBELLE_TYPE_ABSENCE[e.demande.type]} · {e.demande.jours} j
              {e.demande.validationFinale ? ' · validation finale' : ''}
            </span>
          </p>
        )}
        {e.detail && <p className="agenda-fiche-note">{e.detail}</p>}
        {e.entretien && (
          <p className="agenda-detail">
            Un entretien se replanifie ou s’annule depuis le recrutement, sur sa candidature.
          </p>
        )}
        {e.demande && (
          <div className="agenda-fiche-actions">
            <button type="button" className="btn-primary" onClick={() => onDecider(e)}>
              Décider
            </button>
          </div>
        )}
      </div>

      {invite && (
        <div className="agenda-ma-reponse" role="group" aria-label="Votre réponse">
          <span>Vous venez ?</span>
          <span className="agenda-ma-reponse-choix">
            {(['oui', 'peut_etre', 'non'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`agenda-reponse-bouton${e.maReponse === r ? ' is-active' : ''}`}
                aria-pressed={e.maReponse === r}
                onClick={() => onRepondre?.(e, r)}
              >
                {LIBELLES_REPONSE[r]}
              </button>
            ))}
          </span>
        </div>
      )}
    </FenetreAncree>
  );
}
