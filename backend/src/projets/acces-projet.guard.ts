import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { estProjetDuCollaborateur } from './projet-acces';
import { ECRITURE_COLLABORATEUR } from './ecriture-collaborateur.decorator';

// Garde des routes /societes/:slug/projets(/:id/…) — point d'application UNIQUE
// du cloisonnement projet (checklist sécurité #7 / #9).
//
//  · societe_admin  → accès plein (toutes méthodes, tous projets de sa société)
//  · collaborateur  → LECTURE sur les projets suivis par sa cellule (ou dont il
//                     est dessinateur / responsable 3D), + ÉCRITURE sur les
//                     seuls endpoints marqués @EcritureCollaborateur (matrice de
//                     droits — doc de référence). Tout autre write → 403.
//  · autre rôle     → 403.
//
// Le service reste agnostique du rôle : il n'assure que l'isolation société.
@Injectable()
export class AccesProjetGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as
      | { societeId: string; societeSlug: string | null; userId: string; role: string }
      | undefined;
    const slug = req.params.slug as string;
    const projetId = req.params.id as string | undefined;

    if (!user || user.societeSlug !== slug) {
      throw new ForbiddenException("Vous n'avez pas accès à cette société");
    }

    if (user.role === 'societe_admin') return true;

    if (user.role !== 'collaborateur') {
      throw new ForbiddenException('Accès aux projets non autorisé');
    }

    // Écriture : autorisée seulement sur les endpoints explicitement marqués.
    if (req.method !== 'GET') {
      const ouvert = this.reflector.getAllAndOverride<boolean>(
        ECRITURE_COLLABORATEUR,
        [ctx.getHandler(), ctx.getClass()],
      );
      if (!ouvert) {
        throw new ForbiddenException(
          "Cette action est réservée à l'administration de la société.",
        );
      }
      // sinon : on poursuit vers la vérification de périmètre ci-dessous.
    }

    // GET de la liste : pas de projet ciblé, le service restreint le périmètre.
    // (Toutes les écritures ouvertes portent un :id — garde-fou explicite.)
    if (!projetId) {
      if (req.method !== 'GET') {
        throw new ForbiddenException('Action non autorisée sans projet cible.');
      }
      return true;
    }

    const collab = await this.prisma.collaborateur.findFirst({
      where: { utilisateurId: user.userId, societeId: user.societeId },
      select: { id: true, celluleId: true },
    });
    if (!collab) {
      throw new ForbiddenException('Aucune fiche collaborateur pour ce compte');
    }

    const projet = await this.prisma.projet.findFirst({
      where: { id: projetId, societeId: user.societeId },
      select: {
        celluleId: true,
        avantProjet: { select: { dessinateurId: true, responsable3dId: true } },
      },
    });
    if (!projet) throw new NotFoundException('Projet introuvable');

    if (!estProjetDuCollaborateur(projet, collab)) {
      throw new ForbiddenException("Ce projet n'est pas suivi par votre cellule");
    }
    return true;
  }
}
