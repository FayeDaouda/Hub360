import { SetMetadata } from '@nestjs/common';
import type { NiveauPermission } from '@prisma/client';

export const PERMISSION_REQUISE = 'permissionRequise';

export type PermissionRequise = { module: string; niveau: NiveauPermission };

// Marque un endpoint comme exigeant au moins `niveau` sur `module` — vérifié
// par PermissionGuard contre `req.user.permissions` (posé au login depuis
// RolePermission, cf. auth.service.ts). `module` est la `cle` du catalogue
// Module (ex: "crm", "finances_marges"), pas son nom affiché.
export const RequiertPermission = (module: string, niveau: NiveauPermission) =>
  SetMetadata(PERMISSION_REQUISE, { module, niveau } satisfies PermissionRequise);

export const PERMISSION_SELON_METHODE = 'permissionSelonMethode';

export type PermissionSelonMethode = {
  module: string;
  // Rôle dont l'accès est déjà borné ailleurs et que la matrice ne juge pas
  // sur ces routes (ex. 'collaborateur' sous AccesProjetGuard : cellule +
  // @EcritureCollaborateur). Sans cette exemption EXPLICITE, un rôle sans
  // aucune ligne dans la matrice serait refusé partout (défaut = refus).
  roleHorsMatrice?: string;
};

// Pose, au niveau d'un contrôleur entier, l'exigence de la matrice sur
// `module` selon la méthode HTTP : lecture pour GET/HEAD, écriture pour tout
// le reste. Une route ajoutée plus tard est donc couverte d'office (aucun
// oubli possible). Une route qui porte son propre @RequiertPermission (ex.
// finances) garde SA règle, sans exemption.
export const PermissionSelonMethode = (module: string, options: { roleHorsMatrice?: string } = {}) =>
  SetMetadata(PERMISSION_SELON_METHODE, { module, ...options } satisfies PermissionSelonMethode);
