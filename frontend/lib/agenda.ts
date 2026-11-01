import { apiSociete } from './client-api';

// Agenda (lot 11, 01/11/2026) — API NestJS :
//   GET    …/agenda?du=AAAA-MM-JJ[&personne=id]   la semaine
//   GET    …/agenda/personnes                    collègues (invitations, agenda des autres)
//   POST   …/agenda                              { titre, debut, fin, lieu?, description?, inviteIds? }
//   DELETE …/agenda/:id                          annuler (l'organisateur)

export type ElementAgenda = {
  id: string;
  type: 'rendez_vous' | 'echeance' | 'conge';
  titre: string;
  jour: string;
  debut: string | null;
  fin: string | null;
  lieu: string | null;
  detail: string | null;
  organisateur: string | null;
  invites: string[];
  annulable: boolean;
};
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

export const getSemaine = (slug: string, du: string, personne?: string) =>
  apiSociete<SemaineAgenda>(slug, `/agenda?du=${du}${personne ? `&personne=${personne}` : ''}`);
export const getPersonnesAgenda = (slug: string) =>
  apiSociete<{ id: string; nom: string }[]>(slug, '/agenda/personnes');
export const creerRendezVous = (slug: string, r: NouveauRendezVous) =>
  apiSociete<{ id: string }>(slug, '/agenda', { method: 'POST', body: r });
export const annulerRendezVous = (slug: string, id: string) =>
  apiSociete<{ ok: true }>(slug, `/agenda/${id}`, { method: 'DELETE' });
