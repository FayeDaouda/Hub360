import { apiSociete } from './client-api';

// Recrutement (lot 13, 01/11/2026) — API NestJS sous …/recrutement.
export type Poste = {
  id: string;
  intitule: string;
  description: string | null;
  equipe: string | null;
  statut: 'a_approuver' | 'ouvert' | 'pourvu' | 'ferme';
  demandePar: string;
  motifRefus: string | null;
  candidats: { candidature: number; entretien: number; embauche: number; refusee: number };
};
export type VueRecrutement = {
  postes: Poste[];
  equipes: { id: string; nom: string }[];
  droits: {
    demanderPoste: boolean;
    approuverPoste: boolean;
    fermerPoste: boolean;
    voirCandidats: boolean;
    gererCandidats: boolean;
    retirerCandidats: boolean;
    decider: boolean;
  };
};
export type Candidat = {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  notes: string;
  etape: 'candidature' | 'entretien' | 'embauche' | 'refusee';
  motif: string | null;
  decideLe: string | null;
  dossierId: string | null;
};

const base = '/recrutement';
const post = <T>(slug: string, chemin: string, body: object) =>
  apiSociete<T>(slug, `${base}${chemin}`, { method: 'POST', body });

export const getRecrutement = (slug: string) => apiSociete<VueRecrutement>(slug, base);
export const demanderPoste = (slug: string, p: { intitule: string; description?: string; celluleId?: string }) =>
  post<{ id: string; statut: Poste['statut'] }>(slug, '/postes', p);
export const deciderPoste = (slug: string, id: string, accepter: boolean, motif?: string) =>
  post<{ ok: true }>(slug, `/postes/${id}/decision`, { accepter, ...(motif ? { motif } : {}) });
export const fermerPoste = (slug: string, id: string) => post<{ ok: true }>(slug, `/postes/${id}/fermeture`, {});
export const getCandidats = (slug: string, posteId: string) =>
  apiSociete<Candidat[]>(slug, `${base}/postes/${posteId}/candidats`);
export const ajouterCandidat = (
  slug: string,
  posteId: string,
  c: { prenom: string; nom: string; email?: string; telephone?: string; notes?: string },
) => post<{ id: string }>(slug, `/postes/${posteId}/candidats`, c);
export const noterCandidat = (slug: string, id: string, note: string, entretien = false) =>
  post<{ ok: true }>(slug, `/candidats/${id}/notes`, { note, entretien });
export const deciderEmbauche = (
  slug: string,
  id: string,
  d: { embaucher: boolean; dateEntree?: string; motif?: string },
) => post<{ ok: true }>(slug, `/candidats/${id}/decision`, d);
export const retirerCandidat = (slug: string, id: string) =>
  apiSociete<{ ok: true }>(slug, `${base}/candidats/${id}`, { method: 'DELETE' });
