import { ExecutionContext, Injectable } from '@nestjs/common';
import { ROLE_DIR_GC } from '@hub/domain';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';

// Réglages des contrats (modèle, signataires, annexes) : l'administration ou
// le CIO, comme toute configuration de société, et aussi le Dir. GC — c'est
// lui qui signe les contrats en deçà du seuil et qui les prépare (décision du
// user, 29/10/2026). Même exigence : jeton émis pour la société de l'URL.
@Injectable()
export class ParametresContratGuard extends SocieteAdminOuCioGuard {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (user && user.societeSlug === req.params.slug && user.role === ROLE_DIR_GC) return true;
    return super.canActivate(ctx);
  }
}
