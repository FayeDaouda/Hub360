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
    if (bonneSociete && (user.role === ROLE_CIO || user.role === 'societe_admin')) return true;

    throw new ForbiddenException(
      'Réservé à l’administration de la société ou au CIO.',
    );
  }
}
