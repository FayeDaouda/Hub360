import { apiSociete } from './client-api';

// Annonces (lot 12, 01/11/2026) — API NestJS :
//   GET  …/annonces                    fil, à valider, droits
//   POST …/annonces                    { titre, contenu, audience, celluleId?, importante? }
//   POST …/annonces/:id/validation | /retrait | /lecture

export type Annonce = {
  id: string;
  titre: string;
  contenu: string;
  audience: 'societe' | 'groupe' | 'equipe';
  destinataires: string;
  importante: boolean;
  statut: 'a_valider' | 'publiee' | 'retiree';
  auteur: string;
  societe: string;
  publieeLe: string | null;
  lue: boolean;
  lectures: number | null;
  peutRetirer: boolean;
};
export type VueAnnonces = {
  annonces: Annonce[];
  aValider: Annonce[];
  peutRediger: boolean;
  publieDirectement: boolean;
  equipes: { id: string; nom: string }[];
};
export type NouvelleAnnonce = {
  titre: string;
  contenu: string;
  audience: Annonce['audience'];
  celluleId?: string;
  importante?: boolean;
};

export const getAnnonces = (slug: string) => apiSociete<VueAnnonces>(slug, '/annonces');
export const creerAnnonce = (slug: string, a: NouvelleAnnonce) =>
  apiSociete<{ id: string; statut: Annonce['statut'] }>(slug, '/annonces', { method: 'POST', body: a });
const action = (slug: string, id: string, quoi: 'validation' | 'retrait' | 'lecture') =>
  apiSociete<{ ok: true }>(slug, `/annonces/${id}/${quoi}`, { method: 'POST', body: {} });
export const validerAnnonce = (slug: string, id: string) => action(slug, id, 'validation');
export const retirerAnnonce = (slug: string, id: string) => action(slug, id, 'retrait');
export const lireAnnonce = (slug: string, id: string) => action(slug, id, 'lecture');
