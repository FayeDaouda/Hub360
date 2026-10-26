import type { CompteGroupe, ComptesGroupe, InvitationCompte, StatutCompteGroupe } from './types';
import { apiAuth } from './client-api';

// Comptes & rôles — API NestJS, admin du groupe (HoldingAdminGuard) :
//   GET  /groupe/comptes                                 sociétés, rôles attribuables, comptes
//   PUT  /groupe/comptes/:id/societes/:societeId/role    { roleId } — coupe les sessions du compte
//   POST /groupe/comptes                                 { dossierId, email, roleId } — crée + invite (cellule : le Dir. GC)
//   POST /groupe/comptes/:id/invitation                  renvoie l'invitation (compte en attente)
//   PUT  /groupe/comptes/:id/actif                       { actif } — désactiver coupe les sessions

export function getComptesGroupe(): Promise<ComptesGroupe> {
  return apiAuth<ComptesGroupe>('/groupe/comptes');
}

export function changerRoleCompte(utilisateurId: string, societeId: string, roleId: string): Promise<CompteGroupe> {
  return apiAuth<CompteGroupe>(`/groupe/comptes/${utilisateurId}/societes/${societeId}/role`, {
    method: 'PUT',
    body: { roleId },
  });
}

export function creerCompte(body: {
  dossierId: string;
  email: string;
  roleId: string;
}): Promise<InvitationCompte & { compte: CompteGroupe }> {
  return apiAuth('/groupe/comptes', { method: 'POST', body });
}

export function renvoyerInvitation(utilisateurId: string): Promise<InvitationCompte> {
  return apiAuth(`/groupe/comptes/${utilisateurId}/invitation`, { method: 'POST' });
}

export function changerActifCompte(
  utilisateurId: string,
  actif: boolean,
): Promise<{ id: string; statut: StatutCompteGroupe }> {
  return apiAuth(`/groupe/comptes/${utilisateurId}/actif`, { method: 'PUT', body: { actif } });
}

// Téléphone perdu : retire la double authentification (sessions coupées) ;
// la personne la réactive à sa prochaine connexion.
export function reinitialiserDoubleFacteur(utilisateurId: string): Promise<{ id: string; doubleFacteur: boolean }> {
  return apiAuth(`/groupe/comptes/${utilisateurId}/double-facteur/reinitialisation`, { method: 'POST' });
}

// Libellés affichés : les noms techniques des rôles socles restent en base,
// l'écran montre un intitulé lisible ; le suffixe « (transverse) » est porté
// par le regroupement de la liste, pas répété sur chaque option.
const LIBELLES_ROLES: Record<string, string> = {
  societe_admin: 'Administration société',
  holding_admin: 'Administration groupe',
};

export function libelleRole(nom: string): string {
  return LIBELLES_ROLES[nom] ?? nom.replace(/\s*\(transverse\)$/, '');
}

// Ordre métier (celui de la matrice validée), pas alphabétique.
const ORDRE_ROLES = [
  'Dir. GC',
  'COO',
  'CFO',
  'RH',
  'Salarié',
  'CEO (transverse)',
  'CTO (transverse)',
  'CIO (transverse)',
];

export function comparerRoles(a: { nom: string }, b: { nom: string }): number {
  const ia = ORDRE_ROLES.indexOf(a.nom);
  const ib = ORDRE_ROLES.indexOf(b.nom);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.nom.localeCompare(b.nom, 'fr');
}
