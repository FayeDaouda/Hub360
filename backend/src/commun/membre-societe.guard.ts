import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// À poser après JwtAuthGuard sur les routes /societes/:slug/… ouvertes à
// TOUS les membres d'une société (admin comme collaborateur) — par ex.
// « mon-profil ». Contrairement à SocieteAccesGuard, aucun rôle n'est exigé :
// on vérifie seulement que le token a bien été émis pour CETTE société.
@Injectable()
export class MembreSocieteGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params.slug;

    if (!user || user.societeSlug !== slug) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }
    return true;
  }
}
