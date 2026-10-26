import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NiveauPermission } from '@prisma/client';
import {
  COMPTE_COMME_LECTURE,
  PERMISSION_REQUISE,
  PERMISSION_SELON_METHODE,
  PermissionRequise,
  PermissionSelonMethode,
} from './permission.decorator';

// Ordre total des niveaux — un niveau donne accès à tout ce qui est en
// dessous (validation implique ecriture implique lecture).
const ORDRE: Record<NiveauPermission, number> = {
  aucun: 0,
  lecture: 1,
  ecriture: 2,
  validation: 3,
};

// Même règle que le garde, pour un service qui doit décider au niveau d'un
// CHAMP (ex. commission d'apporteur masquée dans une réponse) plutôt que
// d'une route entière.
export function aLaPermission(
  permissions: Record<string, NiveauPermission> | undefined,
  module: string,
  niveau: NiveauPermission,
): boolean {
  return ORDRE[permissions?.[module] ?? 'aucun'] >= ORDRE[niveau];
}

// À poser après JwtAuthGuard sur une route marquée @RequiertPermission(module,
// niveau). Sans le décorateur, laisse passer (opt-in route par route — cf.
// mémoire grey-concrete-role-permission-system : le déploiement se fait guard
// par guard, pas en un seul changement qui rebrancherait tout l'admin d'un
// coup). Absence d'entrée pour le module dans req.user.permissions = 'aucun'
// (fail closed), pas une exception.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest();
    const permissions = req.user?.permissions as Record<string, NiveauPermission> | undefined;

    // Règle explicite d'une route (ex. finances) : prioritaire, sans exemption.
    const requis = this.reflector.getAllAndOverride<PermissionRequise | undefined>(PERMISSION_REQUISE, cibles);
    if (requis) {
      verifier(permissions, requis.module, requis.niveau);
      return true;
    }

    // Règle de contrôleur selon la méthode (cf. @PermissionSelonMethode).
    const selon = this.reflector.getAllAndOverride<PermissionSelonMethode | undefined>(
      PERMISSION_SELON_METHODE,
      cibles,
    );
    if (!selon) return true;
    if (selon.roleHorsMatrice && req.user?.role === selon.roleHorsMatrice) return true;
    const lecture =
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      this.reflector.getAllAndOverride<boolean>(COMPTE_COMME_LECTURE, cibles) === true;
    verifier(permissions, selon.module, lecture ? 'lecture' : 'ecriture');
    return true;
  }
}

function verifier(
  permissions: Record<string, NiveauPermission> | undefined,
  module: string,
  niveau: NiveauPermission,
): void {
  if (!aLaPermission(permissions, module, niveau)) {
    throw new ForbiddenException(`Accès insuffisant sur le module « ${module} » (niveau requis : ${niveau}).`);
  }
}
