import { SetMetadata } from '@nestjs/common';
import type { Right } from '@hub/domain';

export const PERMISSION_REQUISE = 'permissionRequise';

export type PermissionRequise = { module: string; niveau: Right };

// Marque un endpoint comme exigeant le droit `niveau` (lecture, ecriture,
// validation ou suppression — indépendants depuis le 31/10/2026) sur l'étape
// `module` — vérifié par PermissionGuard contre `req.user.permissions`, relus
// à chaque requête (RightsService). `module` est la `cle` de l'étape (ex.
// "crm", "finances_marges", plus tard "crm.dossiers"), pas son nom affiché.
export const RequiertPermission = (module: string, niveau: Right) =>
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
// `module` selon la méthode HTTP : lecture pour GET/HEAD, suppression pour
// DELETE, écriture pour le reste. Une route ajoutée plus tard est donc couverte d'office (aucun
// oubli possible). Une route qui porte son propre @RequiertPermission (ex.
// finances) garde SA règle, sans exemption.
export const PermissionSelonMethode = (module: string, options: { roleHorsMatrice?: string } = {}) =>
  SetMetadata(PERMISSION_SELON_METHODE, { module, ...options } satisfies PermissionSelonMethode);

export const COMPTE_COMME_LECTURE = 'compteCommeLecture';

// Sous @PermissionSelonMethode : route non-GET qui ne fait que LIRE au sens
// métier (ex. marquer un canal lu, ticket du flux de réception) — jugée au
// niveau lecture plutôt qu'écriture.
export const CompteCommeLecture = () => SetMetadata(COMPTE_COMME_LECTURE, true);
