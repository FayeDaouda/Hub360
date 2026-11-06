import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Carte blanche (Administrateur HUB 29/10/2026, CIO 31/10/2026), quel que
// soit le rôle endossé : matrice des droits, interventions, interrupteurs.
// Le jeton doit avoir été émis pour la société de l'URL quand la route en
// porte une (même règle que SocieteAdminOuCioGuard : les services lisent la
// société du jeton).
@Injectable()
export class HubAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params?.slug;
    if (!user?.fullAccess) throw new ForbiddenException('Réservé au CIO et à l’Administrateur HUB.');
    if (slug && user.societeSlug !== slug) throw new ForbiddenException("Vous n'avez pas accès à cette société");
    return true;
  }
}
