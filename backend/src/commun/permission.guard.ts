import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRight, RIGHT_LABELS, type Right } from '@hub/domain';
import {
  COMPTE_COMME_LECTURE,
  PERMISSION_REQUISE,
  PERMISSION_SELON_METHODE,
  PermissionRequise,
  PermissionSelonMethode,
} from './permission.decorator';

// Même règle que le garde, pour un service qui doit décider au niveau d'un
// CHAMP (ex. commission d'apporteur masquée dans une réponse) plutôt que
// d'une route entière. Quatre droits indépendants (31/10/2026) : la
// validation ne donne pas l'écriture.
export function aLaPermission(
  permissions: Record<string, string> | undefined,
  module: string,
  niveau: Right | 'aucun',
): boolean {
  return hasRight(permissions, module, niveau);
}

// À poser après JwtAuthGuard sur une route marquée @RequiertPermission(module,
// niveau). Sans le décorateur, laisse passer (opt-in route par route — cf.
// mémoire grey-concrete-role-permission-system : le déploiement se fait guard
// par guard, pas en un seul changement qui rebrancherait tout l'admin d'un
// coup). Absence d'entrée pour l'étape dans req.user.permissions = aucun droit
// (refus par défaut), pas une exception.
//
// `req.user.permissions` est relu à chaque requête (JwtStrategy →
// RightsService), interrupteurs de la société déjà appliqués : un droit retiré
// ou un module coupé est refusé tout de suite, quel que soit l'âge du jeton.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest();
    const permissions = req.user?.permissions as Record<string, string> | undefined;

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
    verifier(
      permissions,
      selon.module,
      droitSelonMethode(req.method, this.reflector.getAllAndOverride<boolean>(COMPTE_COMME_LECTURE, cibles)),
    );
    return true;
  }
}

function droitSelonMethode(methode: string, compteCommeLecture: boolean | undefined): Right {
  if (methode === 'GET' || methode === 'HEAD' || compteCommeLecture === true) return 'lecture';
  return methode === 'DELETE' ? 'suppression' : 'ecriture';
}

function verifier(permissions: Record<string, string> | undefined, module: string, niveau: Right): void {
  if (!aLaPermission(permissions, module, niveau)) {
    throw new ForbiddenException(
      `Accès insuffisant sur « ${module} » : le droit ${RIGHT_LABELS[niveau]} est nécessaire.`,
    );
  }
}
