import { niveauSuffisant } from './auth';
import type { Session } from './types';
import {
  ROLE_CEO,
  ROLE_CFO,
  ROLE_CIO,
  ROLE_COMPANY_ADMIN,
  ROLE_COO,
  ROLE_CTO,
  ROLE_DIR_GC,
  ROLE_EMPLOYEE,
  ROLE_HOLDING_ADMIN,
  ROLE_HR,
} from '@hub/domain';

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
  'tableau-de-bord': 'pilotage', // Pilotage · tableau de bord Holding (maquette)
  crm: 'crm', // clé de nav → module de la matrice
  projets: 'projets',
  equipe: 'equipe',
  facturation: 'finances_factures',
  rh: 'rh',
};

// Module de la matrice qui gouverne une section (guide d'aide : niveau du rôle).
export const moduleDeSection = (cle: string): string | undefined => SECTIONS_DIRECTION[cle];

// Ordre de préférence pour la page d'arrivée (= ordre de la sidebar).
export const ORDRE_SECTIONS = [
  'mes-taches',
  'tableau-de-bord',
  'crm',
  'projets',
  'facturation',
  'rh',
  'equipe',
  'mon-espace',
];
const CHEMINS: Record<string, string> = {
  'mes-taches': 'mes-taches',
  'mes-reglages': 'mes-reglages',
  'tableau-de-bord': '',
  crm: 'crm',
  projets: 'projets',
  facturation: 'facturation',
  rh: 'rh',
  equipe: 'equipe',
  'mon-espace': 'mon-espace',
  parametres: 'reglages',
};

// Rôle socle qui a son propre espace (/groupe) — même liste que
// backend/src/commun/back-office.guard.ts.
const ROLES_HORS_BACK_OFFICE = new Set([ROLE_HOLDING_ADMIN]);

// Lecture et commentaires dans les fils, sans action sur les tâches — même
// liste que backend/src/projects/review-rules.ts (THREAD_COMMENT_ROLES).
export function consultationEtCommentaires(session: Session): boolean {
  return [ROLE_CEO, ROLE_CFO].includes(session.role);
}

// Administration du HUB (/groupe : comptes, rôles, salaires) — même règle
// que backend/src/commun/administration-hub.guard.ts : le CIO, ou le compte
// technique holding_admin (secours), et l'Administrateur HUB quel que soit le
// rôle endossé (carte blanche, 29/10/2026).
export function estAdministrateurHub(session: Session): boolean {
  return !!session.adminHub || session.role === ROLE_CIO || session.role === ROLE_HOLDING_ADMIN;
}

// Réglages des contrats (modèle, signataires, annexes) — même règle que
// backend/src/contrats/parametres-contrat.guard.ts : administration, CIO,
// Administrateur HUB, et le Dir. GC (29/10/2026).
export function peutReglerContrats(session: Session): boolean {
  return (
    !!session.adminHub ||
    session.role === ROLE_CIO ||
    session.role === ROLE_COMPANY_ADMIN ||
    session.role === ROLE_DIR_GC
  );
}

export function sectionAccessible(session: Session, cle: string): boolean {
  // Mes tâches (revue Salarié 19/10/2026) : sa page d'arrivée, hors matrice
  // comme Mon espace — le serveur ne sert que les tâches du compte connecté.
  // Testé avant societe_admin, qui verrait sinon toutes les sections.
  if (cle === 'mes-taches') return session.role === ROLE_EMPLOYEE;
  // Administration : ses lignes de la matrice font foi pour les sections
  // qu'elle gouverne (bilan avant déploiement, 22/10/2026 : la page RH lui
  // était proposée alors que la matrice la lui ferme) ; le reste est ouvert.
  if (session.role === ROLE_COMPANY_ADMIN) {
    const moduleSection = SECTIONS_DIRECTION[cle];
    return !moduleSection || niveauSuffisant(session, moduleSection, 'lecture');
  }
  if (ROLES_HORS_BACK_OFFICE.has(session.role)) return false;
  // Mes réglages (19/10/2026) : compte, sécurité, apparence — chacun les
  // siens, hors matrice (le CIO garde aussi les Réglages du HUB).
  if (cle === 'mes-reglages') return true;
  // Mon espace (RH lot 5) : chacun le sien, hors matrice — le serveur ne
  // sert que le dossier du compte connecté.
  if (cle === 'mon-espace') return true;
  // Paramètres (matrice des rôles, gabarits, localités, contrats) : pouvoir
  // d'admin plateforme hors matrice — le CIO et l'Administrateur HUB, en plus
  // de l'admin société.
  if (cle === 'parametres') return !!session.adminHub || session.role === ROLE_CIO;
  const moduleMatrice = SECTIONS_DIRECTION[cle];
  return !!moduleMatrice && niveauSuffisant(session, moduleMatrice, 'lecture');
}

// Chemin (relatif à /admin/[slug]) de la première section accessible, ou
// null si aucune → le rôle n'a rien à faire dans le back-office.
export function premiereSectionAccessible(session: Session): string | null {
  const prefere = ARRIVEE_PAR_ROLE[session.role];
  if (prefere && sectionAccessible(session, prefere)) return CHEMIN_ARRIVEE[session.role] ?? CHEMINS[prefere];
  const cle = ORDRE_SECTIONS.find((c) => sectionAccessible(session, c));
  return cle === undefined ? null : CHEMINS[cle];
}

// Page d'arrivée propre à un rôle, avant l'ordre du menu : la RH arrive sur
// sa page (« À traiter aujourd'hui » en tête), pas sur Pilotage (revue RH 20/10/2026) ;
// le CFO sur Finances (« À valider aujourd'hui », revue CFO 20/10/2026).
// Le CTO arrive sur Projets › Production, « À décider aujourd'hui » au-dessus
// (revue CTO, 21/10/2026).
// Le COO arrive sur le CRM, « À traiter aujourd'hui » et sa performance
// commerciale en tête (revue COO, 22/10/2026).
// Le CIO arrive sur Réglages, « À traiter aujourd'hui » en tête (revue CIO, 22/10/2026).
const ARRIVEE_PAR_ROLE: Record<string, string> = {
  [ROLE_HR]: 'rh',
  [ROLE_CFO]: 'facturation',
  [ROLE_CTO]: 'projets',
  [ROLE_COO]: 'crm',
  [ROLE_CIO]: 'parametres',
};
const CHEMIN_ARRIVEE: Record<string, string> = { [ROLE_CTO]: 'projets?vue=production' };

// Section d'arrivée propre au rôle, si accessible (null sinon) : sur
// téléphone, elle prend toujours un onglet du bas, en premier.
export function sectionArrivee(session: Session): string | null {
  const s = ARRIVEE_PAR_ROLE[session.role];
  return s && sectionAccessible(session, s) ? s : null;
}
