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

export function sectionAccessible(session: Session, cle: string): boolean {
  if (session.role === 'societe_admin') return true;
  if (ROLES_HORS_BACK_OFFICE.has(session.role)) return false;
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
