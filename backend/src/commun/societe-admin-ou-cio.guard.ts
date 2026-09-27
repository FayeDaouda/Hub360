import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// Nom du rôle transverse CIO (holding, cf. seed.ts) — comparaison directe
// comme le reste du projet le fait pour les rôles socles (`'societe_admin'`
// etc.) : Role.nom est le seul identifiant stable dont on dispose, pas de
// code séparé. Si le CIO est renommé un jour, ce fichier est le seul à
// mettre à jour.
export const ROLE_CIO = 'CIO (transverse)';

// À poser après JwtAuthGuard sur une route de configuration « méta » d'une
// société (ex: gabarit Unbord) — pas une permission de module (la matrice
// RolePermission ne couvre que les modules métier), un pouvoir d'admin
// plateforme. Deux chemins d'autorisation distincts, comme pour le
// dispatcher de cellule (« admin OU dispatcher ») : societe_admin DE cette
// société, ou le rôle transverse CIO (portée holding, donc sans lien à
// vérifier avec le slug — cf. UtilisateurSocieteRole.societeId null).
@Injectable()
export class SocieteAdminOuCioGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const slug = req.params.slug;

    if (!user) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }
    if (user.role === ROLE_CIO) return true;
    if (user.role === 'societe_admin' && user.societeSlug === slug) return true;

    throw new ForbiddenException(
      'Réservé à l’administration de la société ou au CIO.',
    );
  }
}
