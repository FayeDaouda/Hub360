import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fullName } from './project-query';
import type { ProjectTeamsDto } from './project-teams.dto';

const TEAM = {
  id: true,
  code: true,
  nom: true,
  dispatcher: { select: { prenom: true, nom: true } },
} as const;

type Team = { id: string; code: string; nom: string; dispatcher: { prenom: string; nom: string } | null };
const toTeam = (c: Team) => ({ id: c.id, code: c.code, nom: c.nom, chef: fullName(c.dispatcher) });

// Équipes d'un projet (décision du 29/10/2026) : le Dir. GC affecte le projet
// à une ou plusieurs cellules dès l'Onboard, ouvert ou non. Le chef de chaque
// équipe y assigne le travail à ses membres ; les membres voient le projet.
@Injectable()
export class ProjectTeamsService {
  constructor(private prisma: PrismaService) {}

  async teams(companyId: string, projectId: string): Promise<ProjectTeamsDto> {
    const [project, available] = await Promise.all([
      this.prisma.projet.findFirst({
        where: { id: projectId, societeId: companyId },
        select: { cellules: { orderBy: { creeLe: 'asc' }, select: { cellule: { select: TEAM } } } },
      }),
      this.prisma.cellule.findMany({
        // Une équipe « reportée » ne reçoit plus de projet.
        where: { societeId: companyId, statut: { not: 'reportee' } },
        select: TEAM,
        orderBy: { code: 'asc' },
      }),
    ]);
    if (!project) throw new NotFoundException('Projet introuvable');
    return { equipes: project.cellules.map((c) => toTeam(c.cellule)), disponibles: available.map(toTeam) };
  }

  // Remplace les équipes du projet (liste vide = « Sans équipe »).
  async setTeams(companyId: string, projectId: string, cellIds: string[]): Promise<ProjectTeamsDto> {
    const ids = [...new Set(cellIds)];
    const project = await this.prisma.projet.findFirst({
      where: { id: projectId, societeId: companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    const found = await this.prisma.cellule.count({ where: { id: { in: ids }, societeId: companyId } });
    if (found !== ids.length) throw new BadRequestException('Équipe inconnue dans cette société.');
    await this.prisma.$transaction(async (tx) => {
      await tx.projetCellule.deleteMany({ where: { projetId: projectId, celluleId: { notIn: ids } } });
      // Les équipes déjà affectées gardent leur date (ordre d'affectation).
      await tx.projetCellule.createMany({
        data: ids.map((celluleId) => ({ projetId: projectId, celluleId })),
        skipDuplicates: true,
      });
    });
    return this.teams(companyId, projectId);
  }
}
