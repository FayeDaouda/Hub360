import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SeuilCeoService } from './seuil-ceo.service';

const CIBLE_SEUIL_CEO = 'cibleSeuilCeo';

type CibleSeuilCeo = { objet: 'devis' | 'facture'; param: string };

// Route de validation financière (envoi, émission, avoir, encaissement) : le
// CEO n'y passe que pour une affaire au-delà du seuil de contresignature
// (cf. seuil-ceo.service.ts). `param` = paramètre d'URL portant l'id du devis
// ou de la facture. À poser APRÈS PermissionGuard (niveau validation), ce que
// fait l'ordre de Nest : gardes du contrôleur, puis ceux de la méthode.
export const ValidationCeoAuDelaDuSeuil = (objet: CibleSeuilCeo['objet'], param: string) =>
  applyDecorators(SetMetadata(CIBLE_SEUIL_CEO, { objet, param } satisfies CibleSeuilCeo), UseGuards(SeuilCeoGuard));

@Injectable()
export class SeuilCeoGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private seuil: SeuilCeoService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cible = this.reflector.get<CibleSeuilCeo | undefined>(CIBLE_SEUIL_CEO, ctx.getHandler());
    if (!cible) return true;
    const req = ctx.switchToHttp().getRequest<{ user: { role: string; societeId: string }; params: Record<string, string> }>();
    const id = req.params[cible.param];
    if (cible.objet === 'devis') await this.seuil.verifierDevis(req.user.role, req.user.societeId, id);
    else await this.seuil.verifierFacture(req.user.role, req.user.societeId, id);
    return true;
  }
}
