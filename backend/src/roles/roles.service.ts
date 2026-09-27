import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  // Rôles visibles pour une société : les siens (societeId = societeId) +
  // les rôles transverses (societeId null, ex. CEO/CTO/CIO) — ces derniers
  // affichés pour transparence mais non éditables ici (cf. majPermission).
  async listerAvecPermissions(societeId: string) {
    const [roles, modules] = await Promise.all([
      this.prisma.role.findMany({
        where: { OR: [{ societeId }, { societeId: null }], supprimeLe: null },
        orderBy: { nom: 'asc' },
        include: { permissions: { include: { module: true } } },
      }),
      this.prisma.module.findMany({ orderBy: { cle: 'asc' } }),
    ]);

    return {
      modules: modules.map((m) => ({ cle: m.cle, nom: m.nom })),
      roles: roles.map((r) => ({
        id: r.id,
        nom: r.nom,
        transverse: r.societeId === null,
        permissions: Object.fromEntries(
          r.permissions.map((p) => [p.module.cle, p.niveau]),
        ) as Record<string, NiveauPermission>,
      })),
    };
  }

  // roleId sûr côté service même si le front n'envoie que des rôles déjà
  // filtrés : un societe_admin ne modifie que les rôles propres à SA
  // société — jamais un rôle transverse (CEO/CTO/CIO), qui relève du CIO à
  // l'échelle holding (gouvernance déjà tranchée, pas encore de guard dédié
  // pour ce flux-là — cf. mémoire grey-concrete-role-permission-system).
  async majPermission(
    societeId: string,
    roleId: string,
    moduleCle: string,
    niveau: NiveauPermission,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Rôle introuvable');
    if (role.societeId !== societeId) {
      throw new ForbiddenException(
        role.societeId === null
          ? 'Les rôles transverses se gèrent au niveau de la holding, pas ici.'
          : "Ce rôle n'appartient pas à votre société.",
      );
    }

    const module = await this.prisma.module.findUnique({ where: { cle: moduleCle } });
    if (!module) throw new NotFoundException('Module introuvable');

    await this.prisma.rolePermission.upsert({
      where: { roleId_moduleId: { roleId, moduleId: module.id } },
      update: { niveau },
      create: { roleId, moduleId: module.id, niveau },
    });
    return { roleId, moduleCle, niveau };
  }
}
