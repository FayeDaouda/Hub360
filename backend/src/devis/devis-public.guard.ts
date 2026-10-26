import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hacherJeton } from '../auth/jetons';
import { identifyCompany, runAsSystem } from '../tenancy/tenant-context';

// Porte du lien public (sans compte, cf. cadrage « Devis ») — aucun
// JwtAuthGuard : le jeton EST l'authentification. Erreur uniforme (404) que
// le jeton soit absent, malformé ou sans correspondance — jamais de
// distinction qui renseignerait un attaquant sur l'existence d'un devis
// (même philosophie que ComptesService.motDePasseOublie : réponse
// constante). Vérifie seulement l'EXISTENCE ; DevisService fait son propre
// chargement pour le contenu (même découpage guard/service que partout
// ailleurs dans ce backend, ex. AccesProjetGuard / FacturationService).
@Injectable()
export class DevisPublicGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.params?.token as string | undefined;
    if (!token) throw new NotFoundException('Devis introuvable');
    // Le jeton désigne le devis de n'importe quelle société : recherché en
    // périmètre système, puis la requête est limitée à sa société (ADR 0001).
    const devis = await runAsSystem('lien public de devis', () =>
      this.prisma.devis.findFirst({
        where: { tokenPublicHash: hacherJeton(token) },
        select: { id: true, societeId: true },
      }),
    );
    if (!devis) throw new NotFoundException('Devis introuvable');
    identifyCompany(devis.societeId);
    return true;
  }
}
