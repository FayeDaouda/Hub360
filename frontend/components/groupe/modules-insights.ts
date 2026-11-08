import type { CatalogueModules } from '@/lib/interrupteurs';
import type { LigneAudit } from '@/lib/pilotage';
import type { MatriceRoles, SocieteComptes } from '@/lib/types';

// Ce que la page Modules sait dire d'un module (refonte du 08/11/2026), sans
// rien demander de plus au serveur : ce qu'il couvre (catalogue), qui perdrait
// l'accès en le coupant (matrice des droits × comptes), et sa dernière bascule
// (journal d'audit). La dernière bascule de la maintenance, elle, vient du
// serveur (elle vaut pour tout le HUB, pas pour le journal d'une société).

export type ModuleImpact = {
  // Comptes actifs de la société qui ont accès au module par leur rôle.
  comptes: number;
  // Rôles concernés, avec leur nombre de comptes actifs (rôles sans compte omis).
  roles: { nom: string; comptes: number }[];
};

/**
 * Comptes qui perdent l'accès si le module est coupé : ceux dont le rôle a la
 * Lecture sur au moins une étape du module. Les rôles à carte blanche (CIO,
 * Administrateur HUB) gardent l'accès à tout et ne sont pas comptés.
 */
export function moduleImpact(cle: string, matrice: MatriceRoles, societe: SocieteComptes): ModuleImpact {
  const etapes = matrice.modules.find((m) => m.cle === cle)?.etapes.map((e) => e.cle) ?? [];
  const roles = matrice.roles
    .filter((r) => !r.carteBlanche && etapes.some((e) => r.droits[e]?.lecture))
    .map((r) => ({
      nom: r.nom,
      comptes: societe.comptes.filter((c) => c.statut === 'actif' && c.role.id === r.id).length,
    }))
    .filter((r) => r.comptes > 0);
  return { comptes: roles.reduce((n, r) => n + r.comptes, 0), roles };
}

/** Fonctions du catalogue qui reposent sur ce module (« Mes tâches », « Permis »…). */
export function moduleCoverage(cle: string, catalogue: CatalogueModules): string[] {
  return catalogue.familles.flatMap((f) => f.modules.filter((m) => m.module?.cle === cle).map((m) => m.nom));
}

export type ModuleToggle = { coupe: boolean; le: string; par: string | null };

// Libellés du journal pour les interventions de l'Administration du HUB
// (backend/src/audit/journal-audit.service.ts, ACTIONS_INTERVENTION) ; le
// détail d'une bascule commence par la clé du module (« crm · CRM désactivé · motif : … »).
const ACTION_COUPE = 'Module désactivé';
const ACTION_REACTIVE = 'Module réactivé';

/** Dernière bascule d'un module dans le journal (lignes du plus récent au plus ancien). */
export function lastModuleToggle(cle: string, lignes: LigneAudit[]): ModuleToggle | null {
  const l = lignes.find(
    (x) =>
      x.categorie === 'administration' &&
      (x.action === ACTION_COUPE || x.action === ACTION_REACTIVE) &&
      x.detail.startsWith(`${cle} · `),
  );
  return l ? { coupe: l.action === ACTION_COUPE, le: l.le, par: l.par } : null;
}
