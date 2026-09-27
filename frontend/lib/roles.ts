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
): Promise<{ roleId: string; moduleCle: string; niveau: NiveauPermission }> {
  return apiSociete(slug, `/roles/${roleId}/modules/${moduleCle}`, {
    method: 'PATCH',
    body: { niveau },
  });
}
