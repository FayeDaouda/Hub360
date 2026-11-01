import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ETAPE, hasRight } from '@hub/domain';

// Modification du catalogue produits et services (grille tarifaire) :
// l'Écriture de l'étape « Catalogue » (matrice, 31/10/2026 ; au départ le CEO,
// décision du 14/10/2026, et le compte d'administration). Le jeton
// doit avoir été émis pour la société de l'URL (même règle que
// SocieteAdminOuCioGuard).
@Injectable()
export class CatalogueEcritureGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (
      user &&
      user.societeSlug === req.params.slug &&
      hasRight(user.permissions, ETAPE.financesCatalogue, req.method === 'DELETE' ? 'suppression' : 'ecriture')
    ) {
      return true;
    }
    throw new ForbiddenException(
      req.method === 'DELETE'
        ? 'Retirer une prestation demande la Suppression de « Catalogue produits et services ».'
        : 'Modifier le catalogue demande l’Écriture de « Catalogue produits et services ».',
    );
  }
}
