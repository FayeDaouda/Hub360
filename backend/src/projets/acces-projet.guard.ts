import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_EMPLOYEE } from '../projects/review-rules';
import {
  PERMISSION_REQUISE,
  PERMISSION_SELON_METHODE,
  PermissionRequise,
  PermissionSelonMethode,
} from '../commun/permission.decorator';

// Garde des routes /societes/:slug/projets/:id/… restantes (facturation d'un
// projet, depuis la phase 1). Le jeton doit avoir été émis pour la société
// de l'URL ; le compte de secours (societe_admin) passe ; un rôle de la
// matrice passe seulement sur un endpoint marqué @RequiertPermission ou sous
// @PermissionSelonMethode, PermissionGuard (posé juste après) tranchant le
// niveau. Le Salarié n'y a pas accès (ses projets passent par
// /projets-ouverts, limités à ses tâches).
@Injectable()
export class AccesProjetGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { societeSlug: string | null; role: string } | undefined;
    if (!user || user.societeSlug !== req.params.slug) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }
    if (user.role === 'societe_admin') return true;
    if (user.role === ROLE_EMPLOYEE) {
      throw new ForbiddenException('Vos projets sont accessibles depuis « Projets ».');
    }
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const marque =
      this.reflector.getAllAndOverride<PermissionRequise | undefined>(PERMISSION_REQUISE, cibles) ||
      this.reflector.getAllAndOverride<PermissionSelonMethode | undefined>(PERMISSION_SELON_METHODE, cibles);
    if (marque) return true;
    throw new ForbiddenException('Accès aux projets non autorisé');
  }
}
