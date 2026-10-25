import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Rôle socle qui a SON propre espace (holding → /groupe) et n'entre jamais
// dans le back-office société.
// societe_admin et tous les rôles de la matrice (Dir. GC, COO, CFO, CEO…)
// y entrent ; ce qu'ils y voient est décidé module par module par
// PermissionGuard + @RequiertPermission, posés APRÈS ce garde.
const ROLES_HORS_BACK_OFFICE = new Set(['holding_admin']);

// societe_admin + rôles de la matrice. Partagé avec le chat : ces rôles n'ont
// pas forcément de fiche collaborateur (pas de cellule) et n'en ont pas besoin.
export function estRoleBackOffice(role: string): boolean {
  return !ROLES_HORS_BACK_OFFICE.has(role);
}

// Remplace SocieteAccesGuard (societe_admin codé en dur) sur les sections
// ouvertes aux rôles de direction (étape C2 : CRM). Seul, il ne donne accès
// à rien : une route derrière lui DOIT porter @RequiertPermission, sinon
// PermissionGuard la laisse passer pour tout membre de la direction.
@Injectable()
export class BackOfficeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params.slug;

    if (!user || user.societeSlug !== slug || !estRoleBackOffice(user.role)) {
      throw new ForbiddenException('Accès réservé à la direction de cette société');
    }
    return true;
  }
}
