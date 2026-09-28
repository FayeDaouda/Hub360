import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// À poser après JwtAuthGuard sur les routes /groupe/… : réservées à l'admin
// du groupe (holding_admin, rôle transverse — le « super admin »), quelle que
// soit la société par laquelle il s'est connecté.
@Injectable()
export class HoldingAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || user.role !== 'holding_admin') {
      throw new ForbiddenException("Accès réservé à l'administration du groupe");
    }
    return true;
  }
}
