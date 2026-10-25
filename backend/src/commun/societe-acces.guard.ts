import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// À poser après JwtAuthGuard sur toutes les routes /societes/:slug/… du
// back-office : exige un token societe_admin émis pour CETTE société.
@Injectable()
export class SocieteAccesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params.slug;

    if (!user || user.role !== 'societe_admin' || user.societeSlug !== slug) {
      throw new ForbiddenException("Accès réservé à l'administration de cette société");
    }
    return true;
  }
}
