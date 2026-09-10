import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SocietesService {
  constructor(private prisma: PrismaService) {}

  // Liste publique pour le portail — pas besoin d'être connecté pour voir les cartes
  async findAllActives() {
    return this.prisma.societe.findMany({
      where: { actif: true },
      select: {
        id: true,
        nom: true,
        slug: true,
        logoUrl: true,
        logoUrlSombre: true,
        couleurMarque: true,
        icone: true,
        secteur: true,
      },
      orderBy: { nom: 'asc' },
    });
  }

  // Fiche publique d'une société (utilisée par l'écran de login pour afficher
  // son nom/logo avant même que l'utilisateur ne se connecte)
  async findBySlug(slug: string) {
    return this.prisma.societe.findFirst({
      where: { slug, actif: true },
      select: {
        id: true,
        nom: true,
        slug: true,
        logoUrl: true,
        logoUrlSombre: true,
        couleurMarque: true,
        icone: true,
        secteur: true,
      },
    });
  }

  async findModulesActifs(societeSlug: string) {
    const societe = await this.prisma.societe.findUnique({
      where: { slug: societeSlug },
      include: {
        modules: {
          where: { actif: true },
          include: { module: true },
        },
      },
    });
    return societe?.modules.map((sm) => sm.module) ?? [];
  }
}
