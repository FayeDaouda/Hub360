import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Pouvoirs propres à l'Administrateur HUB (carte blanche, 29/10/2026), quel
// que soit le rôle endossé : interventions, interrupteurs. Le jeton doit avoir
// été émis pour la société de l'URL quand la route en porte une (même règle
// que SocieteAdminOuCioGuard : les services lisent la société du jeton).
@Injectable()
export class HubAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params?.slug;
    if (!user?.adminHub) throw new ForbiddenException('Réservé à l’Administrateur HUB.');
    if (slug && user.societeSlug !== slug) throw new ForbiddenException("Vous n'avez pas accès à cette société");
    return true;
  }
}
