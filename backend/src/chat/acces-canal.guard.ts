import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { estRoleBackOffice } from '../commun/back-office.guard';
import { ROLE_COMPANY_ADMIN } from '@hub/domain';

// Garde des routes /societes/:slug/canaux/:id/… — point d'application UNIQUE du
// cloisonnement chat, sur le modèle d'AccesProjetGuard.
//   · general → tout membre de la société (déjà garanti par MembreSocieteGuard)
//   · direct  → l'un des deux participants
//   · cellule → membre de CETTE cellule, ou societe_admin (vue transverse).
//               Un rôle de direction sans fiche n'a pas de cellule : refusé.
// Un canal qu'on ne peut pas lire, on ne peut pas y écrire : la garde couvre
// GET messages, POST message et PATCH lecture indifféremment.
@Injectable()
export class AccesCanalGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { societeId: string; userId: string; role: string; adminHub?: boolean } | undefined;
    const canalId = req.params.id as string | undefined;
    if (!user || !canalId) throw new ForbiddenException('Accès refusé');

    const canal = await this.prisma.canal.findFirst({
      where: { id: canalId, societeId: user.societeId },
      select: {
        type: true,
        celluleId: true,
        participant1Id: true,
        participant2Id: true,
      },
    });
    if (!canal) throw new NotFoundException('Canal introuvable');

    if (canal.type === 'general') return true;

    if (canal.type === 'direct') {
      if (user.userId === canal.participant1Id || user.userId === canal.participant2Id) {
        return true;
      }
      throw new ForbiddenException("Cette conversation n'est pas la vôtre");
    }

    // type === 'cellule'
    if (user.adminHub || user.role === ROLE_COMPANY_ADMIN) return true;
    const collab = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId: user.userId, societeId: user.societeId },
      select: { celluleId: true },
    });
    if (!collab && !estRoleBackOffice(user.role)) {
      throw new ForbiddenException('Aucune fiche collaborateur pour ce compte');
    }
    if (collab?.celluleId && collab.celluleId === canal.celluleId) return true;
    throw new ForbiddenException("Ce canal n'est pas celui de votre cellule");
  }
}
