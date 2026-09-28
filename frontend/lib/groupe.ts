import type { CompteGroupe, ComptesGroupe } from './types';
import { apiAuth } from './client-api';

// Comptes & rôles — API NestJS, admin du groupe (HoldingAdminGuard) :
//   GET  /groupe/comptes                                 sociétés, rôles attribuables, comptes
//   PUT  /groupe/comptes/:id/societes/:societeId/role    { roleId } — coupe les sessions du compte
//   PUT  /groupe/comptes/:id/salaire                     { salaireBrutMensuel: number | null }

export function getComptesGroupe(): Promise<ComptesGroupe> {
  return apiAuth<ComptesGroupe>('/groupe/comptes');
}

export function changerRoleCompte(
  utilisateurId: string,
  societeId: string,
  roleId: string,
): Promise<CompteGroupe> {
  return apiAuth<CompteGroupe>(`/groupe/comptes/${utilisateurId}/societes/${societeId}/role`, {
    method: 'PUT',
    body: { roleId },
  });
}

export function definirSalaireCompte(
  utilisateurId: string,
  salaireBrutMensuel: number | null,
): Promise<{ salaireBrutMensuel: number | null }> {
  return apiAuth(`/groupe/comptes/${utilisateurId}/salaire`, {
    method: 'PUT',
    body: { salaireBrutMensuel },
  });
}

// Libellés affichés : les noms techniques des rôles socles restent en base,
// l'écran montre un intitulé lisible ; le suffixe « (transverse) » est porté
// par le regroupement de la liste, pas répété sur chaque option.
const LIBELLES_ROLES: Record<string, string> = {
  collaborateur: 'Collaborateur',
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
  'collaborateur',
];

export function comparerRoles(a: { nom: string }, b: { nom: string }): number {
  const ia = ORDRE_ROLES.indexOf(a.nom);
  const ib = ORDRE_ROLES.indexOf(b.nom);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.nom.localeCompare(b.nom, 'fr');
}

// Saisie d'un salaire : entier FCFA, séparateurs de milliers tolérés
// (espace, espace fine, point par groupes de 3) — refus des décimales et de
// tout le reste plutôt qu'une interprétation hasardeuse (« 850.000,50 »).
const MOTIF_MONTANT = /^(\d{1,3}([ .  ]\d{3})+|\d+)$/;

export function lireSaisieSalaire(texte: string): { valeur: number | null } | { erreur: string } {
  const propre = texte.trim().replace(/\s*FCFA$/i, '');
  if (propre === '') return { valeur: null };
  if (!MOTIF_MONTANT.test(propre)) {
    return { erreur: 'Montant entier en FCFA, sans décimales (ex. 850 000).' };
  }
  return { valeur: Number(propre.replace(/\D/g, '')) };
}
