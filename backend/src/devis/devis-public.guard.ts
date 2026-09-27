import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hacherJeton } from '../auth/jetons';

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
    const devis = await this.prisma.devis.findFirst({
      where: { tokenPublicHash: hacherJeton(token) },
      select: { id: true },
    });
    if (!devis) throw new NotFoundException('Devis introuvable');
    return true;
  }
}
