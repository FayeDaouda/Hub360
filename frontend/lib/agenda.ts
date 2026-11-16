import type { ReponseInvitation } from '@hub/domain';
import { apiSociete } from './client-api';
import type { TypeAbsence } from './types';

// Agenda (lot 11, 01/11/2026) — API NestJS :
//   GET    …/agenda?du=AAAA-MM-JJ[&au=…][&personne=id]   la période (semaine par défaut, 366 j au plus)
//   GET    …/agenda/personnes                    collègues (invitations, agenda des autres)
//   POST   …/agenda                              { titre, debut, fin, lieu?, description?, inviteIds? }
//   PATCH  …/agenda/:id                          modifier (l'organisateur, 12/11/2026)
//   DELETE …/agenda/:id                          annuler (l'organisateur)
//   GET|POST|DELETE …/agenda/abonnement          lien vers Google, Apple, Outlook (12/11/2026)
//   PUT    …/agenda/:id/reponse                  répondre à une invitation (12/11/2026)
//   GET    …/agenda/disponibilites?debut&fin[&exclure]   occupés et absents sur un créneau

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
  // Récurrence (16/11/2026) : pour une occurrence d'une série, la série (cible
  // des actions), son début d'origine, la règle et sa description.
  serieId: string | null;
  occurrence: string | null;
  regle: string | null;
  regleTexte: string | null;
  occurrenceModifiee: boolean;
  // « Tous les événements » : les valeurs de la série (son premier rendez-vous).
  serie: {
    debut: string;
    fin: string;
    titre: string;
    lieu: string | null;
    description: string | null;
    lienVisio: string | null;
  } | null;
  // B3 (12/11/2026) : visio, rappel, sa réponse (invité), celles des invités.
  lienVisio: string | null;
  rappelMinutes: number | null;
  maReponse: ReponseInvitation | null;
  participants: { nom: string; reponse: ReponseInvitation | null }[];
  description: string | null;
  inviteIds: string[];
  // Front seulement (12/11/2026) : élément de l'agenda d'un collègue
  // superposé au sien, avec la couleur de ce collègue.
  calque?: Calque;
  // Demande d'absence à trancher (son agenda) : décision du N+1, ou
  // validation finale du CEO.
  demande?: { id: string; type: TypeAbsence; jours: number; validationFinale: boolean };
};
// Réponses et rappels : les listes de @hub/domain, les mêmes qu'au serveur.
export { LIBELLES_REPONSE, RAPPELS_AGENDA as RAPPELS, type ReponseInvitation } from '@hub/domain';

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
  lienVisio?: string | null;
  rappelMinutes?: number | null;
  regle?: string | null; // RRULE (@hub/domain) ; null : unique
};
export type PorteeSerie = 'occurrence' | 'suivantes' | 'toutes';
// La série d'une occurrence, sinon le rendez-vous lui-même : la cible des actions.
export const cibleDe = (e: Pick<ElementAgenda, 'id' | 'serieId'>) => e.serieId ?? e.id;

export const getAgenda = (slug: string, du: string, au: string, personne?: string) =>
  apiSociete<SemaineAgenda>(slug, `/agenda?du=${du}&au=${au}${personne ? `&personne=${personne}` : ''}`);
export const getPersonnesAgenda = (slug: string) =>
  apiSociete<{ id: string; nom: string }[]>(slug, '/agenda/personnes');
export const creerRendezVous = (slug: string, r: NouveauRendezVous) =>
  apiSociete<{ id: string }>(slug, '/agenda', { method: 'POST', body: r });
// Modifier : la fiche entière, invités compris (une liste absente les retirerait).
export const modifierRendezVous = (
  slug: string,
  id: string,
  r: NouveauRendezVous & { inviteIds: string[]; portee?: PorteeSerie; occurrence?: string },
) => apiSociete<{ ok: true }>(slug, `/agenda/${id}`, { method: 'PATCH', body: r });
// Sur une série : la portée et le début d'origine de l'occurrence visée.
export const annulerRendezVous = (slug: string, id: string, portee?: PorteeSerie, occurrence?: string) =>
  apiSociete<{ ok: true }>(
    slug,
    `/agenda/${id}${portee && occurrence ? `?portee=${portee}&occurrence=${encodeURIComponent(occurrence)}` : ''}`,
    { method: 'DELETE' },
  );

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

export const repondreInvitation = (slug: string, id: string, reponse: ReponseInvitation) =>
  apiSociete<{ ok: true }>(slug, `/agenda/${id}/reponse`, { method: 'PUT', body: { reponse } });
// Disponibilités des seules personnes envisagées (50 au plus).
export const getDisponibilites = (slug: string, debut: string, fin: string, ids: string[], exclure?: string) =>
  apiSociete<{ occupes: string[]; absents: string[] }>(
    slug,
    `/agenda/disponibilites?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}&ids=${ids.slice(0, 50).join(',')}${exclure ? `&exclure=${exclure}` : ''}`,
  );
