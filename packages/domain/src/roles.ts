// Noms des rôles du HUB, tels qu'enregistrés en base (`Role.nom`) et portés
// par la session : une seule source pour le serveur et l'écran (ADR 0004,
// complété le 28/10/2026). Ce sont des noms, pas des règles : qui peut faire
// quoi reste décidé au serveur (matrice des permissions, règles des modules).
//
// Un rôle « (transverse) » vaut pour toutes les sociétés du groupe.

// Direction
export const ROLE_CEO = 'CEO (transverse)';
export const ROLE_CTO = 'CTO (transverse)';
// Super admin du HUB (décision 28/09/2026).
export const ROLE_CIO = 'CIO (transverse)';
// La DAF (« CFO c'est DAF, je garde CFO » — le boss).
export const ROLE_CFO = 'CFO';
// Le commercial (CRM, apporteurs).
export const ROLE_COO = 'COO';
// Architecte DPLG de Grey Concrete : porte les dossiers, valide en suppléance.
export const ROLE_DIR_GC = 'Dir. GC';
export const ROLE_HR = 'RH';
export const ROLE_EMPLOYEE = 'Salarié';

// Comptes d'administration (secours), hors matrice des métiers.
export const ROLE_COMPANY_ADMIN = 'societe_admin';
export const ROLE_HOLDING_ADMIN = 'holding_admin';

// Administrateur HUB (décision du 29/10/2026) : carte blanche sur toutes les
// sociétés. Le compte endosse l'un des rôles ci-dessous (sélecteur du menu du
// compte) et garde tous les modules au niveau « validation ».
export const ROLE_HUB_ADMIN = 'Administrateur HUB (transverse)';
export const ROLES_ENDOSSABLES = [
  ROLE_CEO,
  ROLE_CTO,
  ROLE_CIO,
  ROLE_CFO,
  ROLE_COO,
  ROLE_DIR_GC,
  ROLE_HR,
  ROLE_EMPLOYEE,
] as const;

export type RoleName =
  | typeof ROLE_CEO
  | typeof ROLE_CTO
  | typeof ROLE_CIO
  | typeof ROLE_CFO
  | typeof ROLE_COO
  | typeof ROLE_DIR_GC
  | typeof ROLE_HR
  | typeof ROLE_EMPLOYEE
  | typeof ROLE_COMPANY_ADMIN
  | typeof ROLE_HOLDING_ADMIN
  | typeof ROLE_HUB_ADMIN;
