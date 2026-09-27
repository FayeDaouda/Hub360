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
