import { apiPublic } from './client-api';

// Pages publiques du recrutement (appel à candidatures, 01/11/2026), sans
// compte — API NestJS sous /recrutement-public.
export type MarqueSociete = {
  nom: string;
  slug: string;
  logoUrl: string | null;
  logoUrlSombre: string | null;
  couleurMarque: string | null;
  icone: string | null;
};
export type PieceDemandee = {
  cle: 'cv' | 'lettre' | 'diplomes' | 'portfolio' | 'references' | 'autre';
  libelle: string;
  obligatoire: boolean;
};
export type QuestionAppel = { id: string; libelle: string; obligatoire: boolean };
export type AppelPublic = {
  societe: MarqueSociete;
  poste: string;
  equipe: string | null;
  presentation: string;
  lieu: string | null;
  typeContrat: string | null;
  dateLimite: string | null;
  publieLe: string;
  pieces: PieceDemandee[];
  questions: QuestionAppel[];
  ouvert: boolean;
};
export type PageCarrieres = {
  societe: MarqueSociete;
  appels: {
    slug: string;
    poste: string;
    lieu: string | null;
    typeContrat: string | null;
    dateLimite: string | null;
    publieLe: string;
  }[];
};
export type Candidater = {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  reponses: Record<string, string>;
  pieces: { cle: PieceDemandee['cle']; nom: string; url: string }[];
  consentement: boolean;
  siteWeb?: string;
};

export const getAppelPublic = (slug: string) => apiPublic<AppelPublic>(`/recrutement-public/appels/${slug}`);
export const getCarrieres = (societe: string) => apiPublic<PageCarrieres>(`/recrutement-public/carrieres/${societe}`);
export const candidater = (slug: string, c: Candidater) =>
  apiPublic<{ reference: string }>(`/recrutement-public/appels/${slug}/candidatures`, { method: 'POST', body: c });
