import { apiSociete } from './client-api';
import type { PieceDemandee, QuestionAppel } from './candidature-publique';

// Recrutement (lot 13, 01/11/2026 ; côté RH le même jour) — API NestJS sous
// …/recrutement.
export type Poste = {
  id: string;
  intitule: string;
  description: string | null;
  equipe: string | null;
  statut: 'a_approuver' | 'ouvert' | 'pourvu' | 'ferme';
  demandePar: string;
  motifRefus: string | null;
  direct: boolean; // embauche directe : pourvu d'emblée
  appel: AppelPoste | null; // appel à candidatures (lien externe)
  candidats: { candidature: number; entretien: number; embauche: number; refusee: number };
};
export type AppelPoste = {
  slug: string;
  presentation: string;
  lieu: string | null;
  typeContrat: string | null;
  dateLimite: string | null;
  pieces: PieceDemandee[];
  questions: QuestionAppel[];
  ouvert: boolean;
  enLigne: boolean; // ouvert, poste ouvert, date limite pas dépassée
  recues: number;
};
export type ReglagesAppel = {
  presentation: string;
  lieu?: string;
  typeContrat?: string;
  dateLimite?: string;
  pieces: { cle: PieceDemandee['cle']; libelle?: string; obligatoire: boolean }[];
  questions: { id?: string; libelle: string; obligatoire: boolean }[];
};
export type VueRecrutement = {
  postes: Poste[];
  equipes: { id: string; nom: string }[];
  personnes: { id: string; nom: string }[]; // à inviter à un entretien
  droits: {
    demanderPoste: boolean;
    approuverPoste: boolean;
    fermerPoste: boolean;
    voirCandidats: boolean;
    gererCandidats: boolean;
    retirerCandidats: boolean;
    decider: boolean;
    embaucheDirecte: boolean;
    voirGroupe: boolean;
    gererAppels: boolean;
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
  entretien: { debut: string; fin: string; lieu: string | null } | null; // rendez-vous de l'Agenda
  source: 'saisie' | 'lien';
  pieces: number;
  creeLe: string;
};
export type FicheCandidat = {
  id: string;
  reference: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  poste: string;
  source: 'saisie' | 'lien';
  etape: Candidat['etape'];
  creeLe: string;
  consentementLe: string | null;
  notes: string;
  motif: string | null;
  reponses: { question: string; reponse: string }[];
  pieces: { id: string; cle: string; libelle: string; nom: string; taille: number }[];
};
export type RecrutementSociete = {
  societe: { id: string; nom: string; slug: string };
  embauches12Mois: number;
  postes: { id: string; intitule: string; statut: 'a_approuver' | 'ouvert'; candidature: number; entretien: number }[];
};
export type EmbaucheDirecte = {
  prenom: string;
  nom: string;
  intitule: string;
  dateEntree: string;
  celluleId?: string;
  email?: string;
  telephone?: string;
};
export type Entretien = {
  debut: string;
  fin: string;
  lieu?: string;
  inviteIds?: string[];
  prevenirCandidat?: boolean;
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
  d: { embaucher: boolean; dateEntree?: string; motif?: string; prevenirCandidat?: boolean },
) => post<{ ok: true }>(slug, `/candidats/${id}/decision`, d);
export const retirerCandidat = (slug: string, id: string) =>
  apiSociete<{ ok: true }>(slug, `${base}/candidats/${id}`, { method: 'DELETE' });
export const getRecrutementGroupe = (slug: string) => apiSociete<RecrutementSociete[]>(slug, `${base}/groupe`);
export const embaucheDirecte = (slug: string, e: EmbaucheDirecte) =>
  post<{ ok: true; dossierId: string }>(slug, '/embauche-directe', e);
export const planifierEntretien = (slug: string, id: string, e: Entretien) =>
  post<{ ok: true }>(slug, `/candidats/${id}/entretien`, e);
export const enregistrerAppel = (slug: string, posteId: string, r: ReglagesAppel) =>
  post<{ slug: string }>(slug, `/postes/${posteId}/appel`, r);
export const changerEtatAppel = (slug: string, posteId: string, ouvert: boolean) =>
  post<{ ok: true }>(slug, `/postes/${posteId}/appel/etat`, { ouvert });
export const getFicheCandidat = (slug: string, id: string) =>
  apiSociete<FicheCandidat>(slug, `${base}/candidats/${id}`);
export const getPieceCandidat = (slug: string, id: string, pieceId: string) =>
  apiSociete<{ nom: string; url: string }>(slug, `${base}/candidats/${id}/pieces/${pieceId}`);
