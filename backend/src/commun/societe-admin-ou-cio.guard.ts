import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLE_CIO, ROLE_COMPANY_ADMIN } from '@hub/domain';

// À poser après JwtAuthGuard sur une route de configuration « méta » d'une
// société (ex: gabarit Unbord, matrice des rôles) — pas une permission de
// module (la matrice RolePermission ne couvre que les modules métier), un
// pouvoir d'admin plateforme. Deux chemins d'autorisation distincts, comme
// pour le dispatcher de cellule (« admin OU dispatcher ») : societe_admin de
// cette société, ou le CIO — super admin du HUB (décision 28/09/2026).
// Dans les DEUX cas, le jeton doit avoir été émis pour la société de l'URL :
// les services travaillent sur `req.user.societeId` (société du jeton), donc
// laisser passer un CIO connecté ailleurs modifiait en silence la
// configuration de SA société de connexion, pas celle de l'URL.
@Injectable()
export class SocieteAdminOuCioGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params.slug;

    if (!user) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }
    const bonneSociete = user.societeSlug === slug;
    // L'Administrateur HUB (carte blanche, 29/10/2026), quel que soit le rôle endossé.
    if (bonneSociete && (user.adminHub || user.role === ROLE_CIO || user.role === ROLE_COMPANY_ADMIN)) return true;

    throw new ForbiddenException('Réservé à l’administration de la société ou au CIO.');
  }
}
