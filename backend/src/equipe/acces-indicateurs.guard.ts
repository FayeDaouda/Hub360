import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Garde de GET …/collaborateurs/:id/indicateurs (étape 4).
//
//  · societe_admin  → indicateurs de n'importe quel collaborateur de sa société
//  · collaborateur  → UNIQUEMENT sa propre fiche (:id doit être liée à son compte)
//  · autre rôle     → 403
//
// Les indicateurs sont un calcul de lecture sur l'activité (projets, délais,
// checklists) : un collaborateur voit les siens, personne d'autre ne voit les
// siens sauf l'admin.
@Injectable()
export class AccesIndicateursGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as
      | { societeId: string; societeSlug: string | null; userId: string; role: string }
      | undefined;
    const slug = req.params.slug as string;
    const collaborateurId = req.params.id as string;

    if (!user || user.societeSlug !== slug) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }

    if (user.role === 'societe_admin') return true;

    if (user.role !== 'collaborateur') {
      throw new ForbiddenException('Accès aux indicateurs non autorisé');
    }

    const collab = await this.prisma.collaborateur.findFirst({
      where: { id: collaborateurId, societeId: user.societeId },
      select: { utilisateurId: true },
    });
    if (!collab || collab.utilisateurId !== user.userId) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que vos propres indicateurs',
      );
    }
    return true;
  }
}
