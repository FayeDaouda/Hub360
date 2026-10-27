import { leaveCell } from './cells.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompteMini, versCollaborateur } from '../commun/format-contrat';
import { UpdateEmployeeDto } from './teams.dto';

// On ne remonte QUE ces champs du compte — jamais motDePasseHash.
const AVEC_COMPTE = {
  utilisateur: { select: { email: true, actif: true, motDePasseHash: true } },
} as const;

type AvecUtilisateur = {
  utilisateur: { email: string; actif: boolean; motDePasseHash: string | null } | null;
};

function compteMini(c: AvecUtilisateur): CompteMini {
  const u = c.utilisateur;
  return u ? { email: u.email, actif: u.actif, aMotDePasse: u.motDePasseHash != null } : null;
}

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  // `cellule` : un id (une équipe), plusieurs (tableau — ex. équipes d'un
  // projet multi-cellules depuis sept. 2026), ou le sentinel 'sans' (orphelins).
  async findAll(societeId: string, q?: string, cellule?: string | string[]) {
    const where: Prisma.CollaborateurWhereInput = { societeId };
    if (cellule === 'sans') where.celluleId = null;
    else if (Array.isArray(cellule)) {
      if (cellule.length) where.celluleId = { in: cellule };
    } else if (cellule) where.celluleId = cellule;

    const liste = await this.prisma.collaborateur.findMany({
      where,
      include: AVEC_COMPTE,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    const terme = q?.trim().toLowerCase();
    const filtres = terme ? liste.filter((c) => `${c.prenom} ${c.nom} ${c.role}`.toLowerCase().includes(terme)) : liste;
    return filtres.map((c) => versCollaborateur({ ...c, compte: compteMini(c) }));
  }

  async update(societeId: string, id: string, dto: UpdateEmployeeDto) {
    const actuel = await this.load(societeId, id);
    if (dto.celluleId) await this.checkCell(societeId, dto.celluleId);

    const data: Prisma.CollaborateurUpdateInput = {};
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.niveau !== undefined) data.niveau = dto.niveau;
    if (dto.photo !== undefined) data.photoCle = dto.photo;
    if (dto.dateArrivee !== undefined) data.dateArrivee = dto.dateArrivee;
    if (dto.celluleId !== undefined) {
      data.cellule = dto.celluleId ? { connect: { id: dto.celluleId } } : { disconnect: true };
    }

    // Changement de cellule : le poste occupé dans l'ancienne se libère et
    // un dispatcher n'en est plus le dispatcher — sans ce nettoyage,
    // Cellule.dispatcherId pointerait vers quelqu'un qui n'en est plus membre.
    if (dto.celluleId !== undefined && dto.celluleId !== actuel.celluleId && actuel.celluleId) {
      await this.prisma.$transaction((tx) => leaveCell(tx, id, actuel.celluleId));
    }

    const c = await this.prisma.collaborateur.update({
      where: { id },
      data,
      include: AVEC_COMPTE,
    });
    return versCollaborateur({ ...c, compte: compteMini(c) });
  }

  private async load(societeId: string, id: string) {
    const c = await this.prisma.collaborateur.findFirst({ where: { id, societeId } });
    if (!c) throw new NotFoundException('Collaborateur introuvable');
    return c;
  }

  private async checkCell(societeId: string, celluleId: string) {
    const c = await this.prisma.cellule.findFirst({ where: { id: celluleId, societeId } });
    if (!c) throw new NotFoundException('Cellule introuvable');
  }
}
