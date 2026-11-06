import type { RightSet } from '@hub/domain';
import type { MatriceRoles } from './types';
import { apiSociete } from './client-api';

// Matrice des droits — API NestJS (CIO et Administrateur HUB seuls) :
//   GET …/roles           rôles × étapes des modules
//   PUT …/roles/droits    { changements: [{ roleId, etapeCle, droits }] } → matrice enregistrée

export function getMatriceRoles(slug: string): Promise<MatriceRoles> {
  return apiSociete<MatriceRoles>(slug, '/roles');
}

export type ChangementDroits = { roleId: string; etapeCle: string; droits: RightSet };

// Tout d'un coup : chaque titulaire reçoit un seul avis. Le serveur applique
// la règle de cohérence et rend la matrice telle qu'enregistrée.
export function enregistrerDroits(slug: string, changements: ChangementDroits[]): Promise<MatriceRoles> {
  return apiSociete<MatriceRoles>(slug, '/roles/droits', { method: 'PUT', body: { changements } });
}

// « À traiter aujourd'hui » de l'administration (CIO) — backend roles/administration.service.ts.
export type ElementAdministration = {
  type: 'signalement' | 'invitation' | 'chef_sans_compte' | 'double_facteur' | 'salarie_sans_compte';
  cle: string;
  titre: string;
  detail: string;
  ton: 'risque' | 'attention' | 'info';
  le: string | null;
};
export function getATraiterAdministration(slug: string): Promise<ElementAdministration[]> {
  return apiSociete<ElementAdministration[]>(slug, '/administration/a-traiter');
}
