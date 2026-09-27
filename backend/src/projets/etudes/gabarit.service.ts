import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreerBlocEtudeGabaritDto,
  CreerLigneEtudeGabaritDto,
  MajBlocEtudeGabaritDto,
  MajLigneEtudeGabaritDto,
  ReordonnerBlocEtudeGabaritDto,
  ReordonnerLigneEtudeGabaritDto,
} from './gabarit.dto';

// Gabarit Études — configuration société (societe_admin ou CIO, cf.
// SocieteAdminOuCioGuard). Chaque bloc actif amorce un BlocEtude sur tout
// NOUVEAU projet ET se resynchronise sur les projets déjà en cours à chaque
// GET (EtudesService.assurerBlocs, même motif que UnbordService.assurerLignes) ;
// libelle figé sur BlocEtude/ItemEtude à la création, jamais réécrit après
// coup — seul l'ORDRE reste vivant (trié via le gabarit à la lecture).
@Injectable()
export class EtudesGabaritService {
  constructor(private prisma: PrismaService) {}

  listerBlocs(societeId: string) {
    return this.prisma.blocEtudeGabarit.findMany({
      where: { societeId, supprimeLe: null },
      orderBy: { ordre: 'asc' },
      include: {
        items: { where: { supprimeLe: null }, orderBy: { ordre: 'asc' } },
      },
    });
  }

  async creerBloc(societeId: string, dto: CreerBlocEtudeGabaritDto) {
    const { _max } = await this.prisma.blocEtudeGabarit.aggregate({
      where: { societeId },
      _max: { ordre: true },
    });
    return this.prisma.blocEtudeGabarit.create({
      data: { societeId, libelle: dto.libelle, ordre: (_max.ordre ?? -1) + 1 },
      include: { items: true },
    });
  }

  async renommerBloc(societeId: string, id: string, dto: MajBlocEtudeGabaritDto) {
    await this.trouverBloc(societeId, id);
    return this.prisma.blocEtudeGabarit.update({
      where: { id },
      data: { libelle: dto.libelle },
      include: { items: { where: { supprimeLe: null }, orderBy: { ordre: 'asc' } } },
    });
  }

  async reordonnerBlocs(societeId: string, dto: ReordonnerBlocEtudeGabaritDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, rang) =>
        this.prisma.blocEtudeGabarit.updateMany({
          where: { id, societeId },
          data: { ordre: rang },
        }),
      ),
    );
    return this.listerBlocs(societeId);
  }

  async supprimerBloc(societeId: string, id: string, supprimeParId: string) {
    await this.trouverBloc(societeId, id);
    await this.prisma.blocEtudeGabarit.update({
      where: { id },
      data: { supprimeLe: new Date(), supprimeParId },
    });
  }

  async creerLigne(societeId: string, blocId: string, dto: CreerLigneEtudeGabaritDto) {
    await this.trouverBloc(societeId, blocId);
    const { _max } = await this.prisma.ligneEtudeGabarit.aggregate({
      where: { blocEtudeGabaritId: blocId },
      _max: { ordre: true },
    });
    return this.prisma.ligneEtudeGabarit.create({
      data: {
        blocEtudeGabaritId: blocId,
        libelle: dto.libelle,
        ordre: (_max.ordre ?? -1) + 1,
      },
    });
  }

  async renommerLigne(societeId: string, id: string, dto: MajLigneEtudeGabaritDto) {
    await this.trouverLigne(societeId, id);
    return this.prisma.ligneEtudeGabarit.update({
      where: { id },
      data: { libelle: dto.libelle },
    });
  }

  async reordonnerLignes(societeId: string, blocId: string, dto: ReordonnerLigneEtudeGabaritDto) {
    await this.trouverBloc(societeId, blocId);
    await this.prisma.$transaction(
      dto.ids.map((id, rang) =>
        this.prisma.ligneEtudeGabarit.updateMany({
          where: { id, blocEtudeGabaritId: blocId },
          data: { ordre: rang },
        }),
      ),
    );
    return this.prisma.ligneEtudeGabarit.findMany({
      where: { blocEtudeGabaritId: blocId, supprimeLe: null },
      orderBy: { ordre: 'asc' },
    });
  }

  async supprimerLigne(societeId: string, id: string, supprimeParId: string) {
    await this.trouverLigne(societeId, id);
    await this.prisma.ligneEtudeGabarit.update({
      where: { id },
      data: { supprimeLe: new Date(), supprimeParId },
    });
  }

  private async trouverBloc(societeId: string, id: string) {
    const bloc = await this.prisma.blocEtudeGabarit.findFirst({
      where: { id, societeId, supprimeLe: null },
    });
    if (!bloc) throw new NotFoundException('Bloc de gabarit introuvable');
    return bloc;
  }

  // Vérifie que la ligne appartient bien à un bloc de CETTE société — passe
  // par le bloc parent, la ligne n'a pas de societeId propre.
  private async trouverLigne(societeId: string, id: string) {
    const ligne = await this.prisma.ligneEtudeGabarit.findFirst({
      where: { id, supprimeLe: null, blocEtudeGabarit: { societeId } },
    });
    if (!ligne) throw new NotFoundException('Item de gabarit introuvable');
    return ligne;
  }
}
