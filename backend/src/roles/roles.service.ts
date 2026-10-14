import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_CIO } from '../commun/societe-admin-ou-cio.guard';

// Rôles socles : leur accès ne passe pas par la matrice (administration =
// tout) — jamais modifiables ici, même par
// le CIO : une case changée sur societe_admin couperait l'accès de toutes
// les administrations de société.
const ROLES_SOCLE = new Set(['holding_admin', 'societe_admin']);

type RoleLu = { nom: string; societeId: string | null };

// Qui modifie quelle ligne de la matrice (gouvernance Bloc A, CIO = super
// admin du HUB, 28/09/2026) : les rôles propres à la société → son admin ou
// le CIO ; les rôles transverses (CEO/CTO/CIO) → le CIO seul.
function motifRefus(role: RoleLu, societeId: string, acteurRole: string): string | null {
  if (ROLES_SOCLE.has(role.nom)) {
    return 'Les rôles d’administration ne se modifient pas depuis la matrice.';
  }
  if (role.societeId === societeId) return null;
  if (role.societeId === null) {
    return acteurRole === ROLE_CIO ? null : 'Les rôles transverses (CEO, CTO, CIO) se gèrent par le CIO.';
  }
  return "Ce rôle n'appartient pas à cette société.";
}

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  // Rôles visibles pour une société : les siens (societeId = societeId) +
  // les rôles transverses (societeId null, ex. CEO/CTO/CIO). `modifiable`
  // est calculé pour l'appelant (même règle que majPermission) : le front
  // l'affiche tel quel, sans refaire la règle de son côté.
  async listerAvecPermissions(societeId: string, acteurRole: string) {
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
        modifiable: motifRefus(r, societeId, acteurRole) === null,
        permissions: Object.fromEntries(
          r.permissions.map((p) => [p.module.cle, p.niveau]),
        ) as Record<string, NiveauPermission>,
      })),
    };
  }

  // Règle revérifiée ici même si le front ne propose que les lignes
  // `modifiable` : cf. motifRefus.
  async majPermission(
    societeId: string,
    roleId: string,
    moduleCle: string,
    niveau: NiveauPermission,
    acteurRole: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.supprimeLe) throw new NotFoundException('Rôle introuvable');
    const refus = motifRefus(role, societeId, acteurRole);
    if (refus) throw new ForbiddenException(refus);

    const module = await this.prisma.module.findUnique({ where: { cle: moduleCle } });
    if (!module) throw new NotFoundException('Module introuvable');

    const cle = { roleId_moduleId: { roleId, moduleId: module.id } };
    const actuelle = await this.prisma.rolePermission.findUnique({ where: cle });
    if (actuelle?.niveau === niveau) return { roleId, moduleCle, niveau };

    await this.prisma.$transaction([
      this.prisma.rolePermission.upsert({
        where: cle,
        update: { niveau },
        create: { roleId, moduleId: module.id, niveau },
      }),
      // Les permissions voyagent dans le jeton (émis à la connexion) : sans
      // cette coupure, chaque titulaire du rôle garderait l'ancien niveau
      // jusqu'à expiration (7 jours). Même mécanisme que le changement de
      // rôle d'un compte (comptes-groupe.service) ; l'auteur de la
      // modification est inclus s'il porte ce rôle, il se reconnecte aussi.
      this.prisma.utilisateur.updateMany({
        where: { roles: { some: { roleId } } },
        data: { sessionsValidesDepuis: new Date() },
      }),
    ]);
    return { roleId, moduleCle, niveau };
  }
}
