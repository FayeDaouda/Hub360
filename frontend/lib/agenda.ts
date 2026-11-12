import { apiSociete } from './client-api';
import type { TypeAbsence } from './types';

// Agenda (lot 11, 01/11/2026) — API NestJS :
//   GET    …/agenda?du=AAAA-MM-JJ[&au=…][&personne=id]   la période (semaine par défaut, 366 j au plus)
//   GET    …/agenda/personnes                    collègues (invitations, agenda des autres)
//   POST   …/agenda                              { titre, debut, fin, lieu?, description?, inviteIds? }
//   PATCH  …/agenda/:id                          modifier (l'organisateur, 12/11/2026)
//   DELETE …/agenda/:id                          annuler (l'organisateur)
//   GET|POST|DELETE …/agenda/abonnement          lien vers Google, Apple, Outlook (12/11/2026)

export type ElementAgenda = {
  id: string;
  type: 'rendez_vous' | 'echeance' | 'conge' | 'demande';
  titre: string;
  jour: string;
  debut: string | null;
  fin: string | null;
  lieu: string | null;
  detail: string | null;
  organisateur: string | null;
  invites: string[];
  annulable: boolean;
  // Modifiable par l'organisateur (12/11/2026) ; jamais un entretien de
  // recrutement, replanifié depuis sa candidature.
  modifiable: boolean;
  entretien: boolean;
  jeSuisOrganisateur: boolean; // la personne dont c'est l'agenda l'organise
  description: string | null;
  inviteIds: string[];
  // Front seulement (12/11/2026) : élément de l'agenda d'un collègue
  // superposé au sien, avec la couleur de ce collègue.
  calque?: Calque;
  // Demande d'absence à trancher (son agenda) : décision du N+1, ou
  // validation finale du CEO.
  demande?: { id: string; type: TypeAbsence; jours: number; validationFinale: boolean };
};
export type Calque = { id: string; nom: string; couleur: string };

export type SemaineAgenda = {
  du: string;
  au: string;
  personne: { id: string; nom: string };
  elements: ElementAgenda[];
  peutVoirAutres: boolean;
  peutCreer: boolean;
  peutInviter: boolean;
};
export type NouveauRendezVous = {
  titre: string;
  debut: string;
  fin: string;
  lieu?: string;
  description?: string;
  inviteIds?: string[];
};

export const getAgenda = (slug: string, du: string, au: string, personne?: string) =>
  apiSociete<SemaineAgenda>(slug, `/agenda?du=${du}&au=${au}${personne ? `&personne=${personne}` : ''}`);
export const getPersonnesAgenda = (slug: string) =>
  apiSociete<{ id: string; nom: string }[]>(slug, '/agenda/personnes');
export const creerRendezVous = (slug: string, r: NouveauRendezVous) =>
  apiSociete<{ id: string }>(slug, '/agenda', { method: 'POST', body: r });
// Modifier : la fiche entière, invités compris (une liste absente les retirerait).
export const modifierRendezVous = (slug: string, id: string, r: NouveauRendezVous & { inviteIds: string[] }) =>
  apiSociete<{ ok: true }>(slug, `/agenda/${id}`, { method: 'PATCH', body: r });
export const annulerRendezVous = (slug: string, id: string) =>
  apiSociete<{ ok: true }>(slug, `/agenda/${id}`, { method: 'DELETE' });

// Abonnement depuis Google Agenda, Apple Calendrier ou Outlook (12/11/2026) :
// le lien clair n'est rendu qu'à la création (seule son empreinte est gardée).
export type EtatAbonnementAgenda = { actif: boolean; creeLe: string | null; dernierAccesLe: string | null };

export const getAbonnementAgenda = (slug: string) => apiSociete<EtatAbonnementAgenda>(slug, '/agenda/abonnement');
export const creerAbonnementAgenda = (slug: string) =>
  apiSociete<{ url: string }>(slug, '/agenda/abonnement', { method: 'POST' });
export const supprimerAbonnementAgenda = (slug: string) =>
  apiSociete<{ ok: true }>(slug, '/agenda/abonnement', { method: 'DELETE' });

// Liens d'ajout : « webcal » ouvre l'agenda de l'appareil (Apple, Outlook) ;
// Google Agenda s'abonne par son adresse « cid », en https (jamais de lecture
// du jeton en clair, même une fois).
export const lienWebcal = (url: string) => url.replace(/^https?:/, 'webcal:');
export const lienGoogleAgenda = (url: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(url)}`;
