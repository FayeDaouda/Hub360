import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLE_CEO } from '../projects/review-rules';

// Modification du catalogue produits et services (grille tarifaire) :
// confiée au CEO (décision du 14/10/2026, « pour l'instant ») ; le compte
// d'administration de la société la garde comme compte de secours. Le jeton
// doit avoir été émis pour la société de l'URL (même règle que
// SocieteAdminOuCioGuard).
@Injectable()
export class CatalogueEcritureGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (user && user.societeSlug === req.params.slug && (user.role === ROLE_CEO || user.role === 'societe_admin')) {
      return true;
    }
    throw new ForbiddenException('La modification du catalogue est réservée au CEO.');
  }
}
