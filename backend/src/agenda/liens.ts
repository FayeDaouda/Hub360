// Liens, identifiants et libellés partagés par l'agenda, l'abonnement, les
// invitations et les rappels — sans aucun import d'un service : ces services
// ne s'importent jamais l'un l'autre (cycle de chargement, Nest n'injecterait
// plus rien).
import { formatTime, formatWeekdayDayMonth } from '@hub/domain';

// « jeudi 12 novembre à 09:00 » (notifications des réunions).
export const quandRendezVous = (d: Date) =>
  `${formatWeekdayDayMonth(d.toISOString())} à ${formatTime(d.toISOString())}`;

// Domaine des identifiants d'événements (UID) : stable, jamais une adresse.
const DOMAINE_UID = 'hub360.space';
export const uidEvenement = (genre: 'rdv' | 'echeance' | 'absence', id: string) => `${genre}-${id}@${DOMAINE_UID}`;

export const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

export const urlFront = () => process.env.FRONT_URL || 'http://localhost:3000';
export const urlApiPublique = () =>
  process.env.API_PUBLIC_URL || (process.env.FRONT_URL ? `${process.env.FRONT_URL}/api` : 'http://localhost:3001/api');

export const lienAgendaHub = (slug: string) => `${urlFront()}/admin/${slug}/agenda`;
export const urlFlux = (clair: string) => `${urlApiPublique()}/agenda-abonnement/${clair}.ics`;

// Un entretien vu hors du HUB (Google, Outlook, e-mails) : jamais le nom du
// candidat (décision du 12/11/2026), qui reste dans le HUB.
export const TITRE_ENTRETIEN = 'Entretien de recrutement';
