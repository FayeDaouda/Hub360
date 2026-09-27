import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreerLigneUnbordGabaritDto,
  MajLigneUnbordGabaritDto,
  ReordonnerLigneUnbordGabaritDto,
} from './gabarit.dto';

// Gabarit Unbord — configuration société (societe_admin ou CIO, cf.
// SocieteAdminOuCioGuard). Chaque ligne active amorce un item sur tout
// NOUVEAU projet (UnbordService.assurerLignes) ; les projets déjà seedés ne
// sont jamais réécrits par ce service (libelle/groupe figés sur LigneUnbord
// à la création).
@Injectable()
export class UnbordGabaritService {
  constructor(private prisma: PrismaService) {}

  lister(societeId: string) {
    return this.prisma.ligneUnbordGabarit.findMany({
      where: { societeId, supprimeLe: null },
      orderBy: { ordre: 'asc' },
    });
  }

  async creer(societeId: string, dto: CreerLigneUnbordGabaritDto) {
    const { _max } = await this.prisma.ligneUnbordGabarit.aggregate({
      where: { societeId },
      _max: { ordre: true },
    });
    return this.prisma.ligneUnbordGabarit.create({
      data: {
        societeId,
        groupe: dto.groupe,
        libelle: dto.libelle,
        ordre: (_max.ordre ?? -1) + 1,
      },
    });
  }

  async renommer(societeId: string, id: string, dto: MajLigneUnbordGabaritDto) {
    await this.trouver(societeId, id);
    return this.prisma.ligneUnbordGabarit.update({
      where: { id },
      data: { libelle: dto.libelle },
    });
  }

  async reordonner(societeId: string, dto: ReordonnerLigneUnbordGabaritDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, rang) =>
        this.prisma.ligneUnbordGabarit.updateMany({
          where: { id, societeId },
          data: { ordre: rang },
        }),
      ),
    );
    return this.lister(societeId);
  }

  async supprimer(societeId: string, id: string, supprimeParId: string) {
    await this.trouver(societeId, id);
    await this.prisma.ligneUnbordGabarit.update({
      where: { id },
      data: { supprimeLe: new Date(), supprimeParId },
    });
  }

  private async trouver(societeId: string, id: string) {
    const ligne = await this.prisma.ligneUnbordGabarit.findFirst({
      where: { id, societeId, supprimeLe: null },
    });
    if (!ligne) throw new NotFoundException('Item de gabarit introuvable');
    return ligne;
  }
}
