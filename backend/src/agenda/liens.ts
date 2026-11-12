// Liens et identifiants partagés par l'abonnement (abonnement.service.ts) et
// les invitations (invitations.service.ts) — sans aucun import : ces deux
// services ne s'importent jamais l'un l'autre (cycle de chargement, Nest
// n'injecterait plus rien).

// Domaine des identifiants d'événements (UID) : stable, jamais une adresse.
const DOMAINE_UID = 'hub360.space';
export const uidEvenement = (genre: 'rdv' | 'echeance' | 'absence', id: string) => `${genre}-${id}@${DOMAINE_UID}`;

export const nomDe = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

const urlFront = () => process.env.FRONT_URL || 'http://localhost:3000';
const urlApi = () =>
  process.env.API_PUBLIC_URL || (process.env.FRONT_URL ? `${process.env.FRONT_URL}/api` : 'http://localhost:3001/api');

export const lienAgendaHub = (slug: string) => `${urlFront()}/admin/${slug}/agenda`;
export const urlFlux = (clair: string) => `${urlApi()}/agenda-abonnement/${clair}.ics`;

// Un entretien vu hors du HUB (Google, Outlook, e-mails) : jamais le nom du
// candidat (décision du 12/11/2026), qui reste dans le HUB.
export const TITRE_ENTRETIEN = 'Entretien de recrutement';
