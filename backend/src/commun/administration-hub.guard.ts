import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Administration du HUB (routes /groupe/… : comptes, rôles, salaires) :
// réservée au CIO et à l'Administrateur HUB, quel que soit le rôle endossé
// (décision du 31/10/2026). Le compte technique holding_admin n'y entre plus :
// l'Administrateur HUB tient désormais lieu de compte de secours.
@Injectable()
export class AdministrationHubGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.fullAccess) {
      throw new ForbiddenException('Accès réservé au CIO et à l’Administrateur HUB.');
    }
    return true;
  }
}
