import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { versCellule } from '../commun/format-contrat';
import { CreerCelluleDto, DefinirDispatcherDto, MajCelluleDto } from './dto';

// membres + le strict minimum du compte lié (jamais motDePasseHash).
const MEMBRES = {
  membres: {
    include: { utilisateur: { select: { email: true, actif: true, motDePasseHash: true } } },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  },
} satisfies Prisma.CelluleInclude;

type CelluleAvecMembres = Prisma.CelluleGetPayload<{ include: typeof MEMBRES }>;

function formater(cel: CelluleAvecMembres) {
  return versCellule({
    ...cel,
    membres: cel.membres.map((m) => ({
      ...m,
      compte: m.utilisateur
        ? {
            email: m.utilisateur.email,
            actif: m.utilisateur.actif,
            aMotDePasse: m.utilisateur.motDePasseHash != null,
          }
        : null,
    })),
  });
}

@Injectable()
export class CellulesService {
  constructor(private prisma: PrismaService) {}

  async findAll(societeId: string) {
    const cellules = await this.prisma.cellule.findMany({
      where: { societeId },
      include: MEMBRES,
      orderBy: { nom: 'asc' },
    });
    return cellules.map(formater);
  }

  async creer(societeId: string, dto: CreerCelluleDto) {
    const cellule = await this.prisma.cellule.create({
      data: { societeId, nom: dto.nom },
      include: MEMBRES,
    });
    return formater(cellule);
  }

  async renommer(societeId: string, id: string, dto: MajCelluleDto) {
    await this.charger(societeId, id);
    const cellule = await this.prisma.cellule.update({
      where: { id },
      data: { nom: dto.nom },
      include: MEMBRES,
    });
    return formater(cellule);
  }

  // Désigne (ou retire, dispatcherId=null) le dispatcher de la cellule —
  // admin uniquement (décision boss, sept. 2026). Doit être membre de CETTE
  // cellule : un dispatcher répartit les tâches de son équipe, pas d'une
  // autre — vérifié ici plutôt qu'en contrainte DB (le lien est un simple
  // FK vers Collaborateur, sans savoir à quelle cellule il appartient).
  async definirDispatcher(societeId: string, id: string, dto: DefinirDispatcherDto) {
    await this.charger(societeId, id);
    if (dto.dispatcherId) {
      const membre = await this.prisma.collaborateur.findFirst({
        where: { id: dto.dispatcherId, societeId, celluleId: id },
      });
      if (!membre) {
        throw new UnprocessableEntityException(
          'Le dispatcher doit être membre de cette cellule.',
        );
      }
    }
    const cellule = await this.prisma.cellule.update({
      where: { id },
      data: { dispatcherId: dto.dispatcherId },
      include: MEMBRES,
    });
    return formater(cellule);
  }

  async supprimer(societeId: string, id: string) {
    await this.charger(societeId, id);
    const membres = await this.prisma.collaborateur.count({ where: { celluleId: id } });
    if (membres > 0) {
      throw new ConflictException(
        `Cellule non vide (${membres} collaborateur${membres > 1 ? 's' : ''}) — réaffecte-les d'abord.`,
      );
    }
    await this.prisma.cellule.delete({ where: { id } });
  }

  private async charger(societeId: string, id: string) {
    const cellule = await this.prisma.cellule.findFirst({ where: { id, societeId } });
    if (!cellule) throw new NotFoundException('Cellule introuvable');
    return cellule;
  }
}
