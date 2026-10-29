import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLE_CIO, ROLE_HOLDING_ADMIN } from '@hub/domain';

// Administration du HUB (routes /groupe/… : comptes, rôles, salaires). Le
// CIO est le super admin désigné (décision 28/09/2026) ; holding_admin reste
// autorisé comme compte technique de secours — sans lui, un CIO dont le rôle
// serait retiré ou le compte désactivé bloquerait toute l'administration.
export const ROLES_ADMINISTRATION_HUB: ReadonlySet<string> = new Set([ROLE_CIO, ROLE_HOLDING_ADMIN]);

@Injectable()
export class AdministrationHubGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    // L'Administrateur HUB (carte blanche, 29/10/2026), quel que soit le rôle endossé.
    if (!user || !(user.adminHub || ROLES_ADMINISTRATION_HUB.has(user.role))) {
      throw new ForbiddenException("Accès réservé à l'administration du HUB (CIO)");
    }
    return true;
  }
}
