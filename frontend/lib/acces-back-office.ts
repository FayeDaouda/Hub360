import { niveauSuffisant } from './auth';
import type { Session } from './types';

// Qui entre dans le back-office société (/admin/[slug]) et quelles sections
// y voit-il — un seul point de vérité, lu par le layout (redirections), la
// sidebar (menu) et la destination après connexion.
//
// societe_admin : tout, comme avant. Rôles de la matrice (Dir. GC, COO,
// CFO, CEO…) : seulement les sections OUVERTES ci-dessous, et seulement
// s'ils ont au moins la lecture sur le module qui les gouverne. Une section
// absente de la table reste réservée à societe_admin — ses routes serveur
// n'acceptent encore que lui (ouverture section par section : C2 = CRM,
// H5 = Facturation).
const SECTIONS_DIRECTION: Record<string, string> = {
  crm: 'crm', // clé de nav → module de la matrice
  projets: 'projets',
  facturation: 'finances_factures',
};

// Ordre de préférence pour la page d'arrivée (= ordre de la sidebar).
const ORDRE_SECTIONS = ['tableau-de-bord', 'crm', 'projets', 'facturation', 'equipe'];
const CHEMINS: Record<string, string> = {
  'tableau-de-bord': '',
  crm: 'crm',
  projets: 'projets',
  facturation: 'facturation',
  equipe: 'equipe',
  parametres: 'parametres',
};

// Rôles socles qui ont leur propre espace (/groupe, /collab) — même liste
// que backend/src/commun/back-office.guard.ts.
const ROLES_HORS_BACK_OFFICE = new Set(['holding_admin', 'collaborateur']);

// Le CIO est le super admin du HUB (décision 28/09/2026) — même nom de rôle
// que backend/src/commun/societe-admin-ou-cio.guard.ts (ROLE_CIO).
export const ROLE_CIO = 'CIO (transverse)';

// Administration du HUB (/groupe : comptes, rôles, salaires) — même règle
// que backend/src/commun/administration-hub.guard.ts : le CIO, ou le compte
// technique holding_admin (secours).
export function estAdministrateurHub(session: Session): boolean {
  return session.role === ROLE_CIO || session.role === 'holding_admin';
}

export function sectionAccessible(session: Session, cle: string): boolean {
  if (session.role === 'societe_admin') return true;
  if (ROLES_HORS_BACK_OFFICE.has(session.role)) return false;
  // Paramètres (matrice des rôles, gabarits, localités, contrats) : pouvoir
  // d'admin plateforme hors matrice — le CIO, en plus de l'admin société.
  if (cle === 'parametres') return session.role === ROLE_CIO;
  const moduleMatrice = SECTIONS_DIRECTION[cle];
  return !!moduleMatrice && niveauSuffisant(session, moduleMatrice, 'lecture');
}

// Section qui gouverne l'ACCÈS à une URL — celle de la nav, sauf la page
// Facturation d'un projet (/projets/:id/facturation) : elle vit sous Projets
// dans l'URL mais relève de la Facturation (finances_factures), pour qu'une
// CFO y enregistre un paiement sans ouvrir toute la section Projets.
export function sectionPourAcces(pathname: string, slug: string, sectionNav: string): string {
  const reste = pathname.slice(`/admin/${slug}`.length);
  return /^\/projets\/[^/]+\/facturation(\/|$)/.test(reste) ? 'facturation' : sectionNav;
}

// Chemin (relatif à /admin/[slug]) de la première section accessible, ou
// null si aucune → le rôle n'a rien à faire dans le back-office.
export function premiereSectionAccessible(session: Session): string | null {
  const cle = ORDRE_SECTIONS.find((c) => sectionAccessible(session, c));
  return cle === undefined ? null : CHEMINS[cle];
}

// Ce que la personne connectée peut faire sur un projet (écrans admin) —
// mêmes règles que le serveur, qui revérifie tout. Un seul point de vérité
// pour toutes les pages projet.
export type DroitsProjet = {
  ecriture: boolean; // modifier le projet (checklists, blocs, phase, cellules, carte…)
  documents: boolean; // section Documents (module « documents », ouvert plus tard aux rôles)
  facturesLecture: boolean; // montants de facture (Études, Facturation)
  facturesEcriture: boolean;
  marges: boolean; // pré-bilan
};

export function droitsProjet(session: Session): DroitsProjet {
  const admin = session.role === 'societe_admin';
  return {
    ecriture: admin || niveauSuffisant(session, 'projets', 'ecriture'),
    documents: admin,
    facturesLecture: admin || niveauSuffisant(session, 'finances_factures', 'lecture'),
    facturesEcriture: admin || niveauSuffisant(session, 'finances_factures', 'ecriture'),
    marges: admin || niveauSuffisant(session, 'finances_marges', 'lecture'),
  };
}
