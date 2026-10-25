import type { MatriceRoles, NiveauPermission } from './types';
import { apiSociete } from './client-api';

// Rôles & permissions — API NestJS :
//   GET    …/roles                          matrice complète (rôles propres + transverses)
//   PATCH  …/roles/:roleId/modules/:cle      { niveau } — 403 sur un rôle transverse
//                                             ou d'une autre société (RolesService)

export function getMatriceRoles(slug: string): Promise<MatriceRoles> {
  return apiSociete<MatriceRoles>(slug, '/roles');
}

export function majPermissionRole(
  slug: string,
  roleId: string,
  moduleCle: string,
  niveau: NiveauPermission,
): Promise<{ roleId: string; moduleCle: string; niveau: NiveauPermission; enAttente: boolean }> {
  return apiSociete(slug, `/roles/${roleId}/modules/${moduleCle}`, {
    method: 'PATCH',
    body: { niveau },
  });
}

// Droits du rôle CIO (revue CIO, 22/10/2026) : demandes que le CEO valide.
export type DemandeDroit = {
  id: string;
  role: string;
  module: string;
  moduleCle: string;
  avant: NiveauPermission;
  apres: NiveauPermission;
  demandePar: string;
  demandeLe: string;
  peutDecider: boolean;
};
export function getDemandesDroit(slug: string): Promise<DemandeDroit[]> {
  return apiSociete<DemandeDroit[]>(slug, '/droits/demandes');
}
export function deciderDemandeDroit(
  slug: string,
  id: string,
  accepter: boolean,
  motif?: string,
): Promise<DemandeDroit[]> {
  return apiSociete<DemandeDroit[]>(slug, `/droits/demandes/${id}/decision`, {
    method: 'POST',
    body: { accepter, ...(motif ? { motif } : {}) },
  });
}

// « À traiter aujourd'hui » de l'administration (CIO) — backend roles/administration.service.ts.
export type ElementAdministration = {
  type: 'signalement' | 'droit_cio' | 'invitation' | 'chef_sans_compte' | 'double_facteur' | 'salarie_sans_compte';
  cle: string;
  titre: string;
  detail: string;
  ton: 'risque' | 'attention' | 'info';
  le: string | null;
};
export function getATraiterAdministration(slug: string): Promise<ElementAdministration[]> {
  return apiSociete<ElementAdministration[]>(slug, '/administration/a-traiter');
}
