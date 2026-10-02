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
import { codeCellule, prefixeSociete } from './equipes-regles';

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

  // Code SOCIÉTÉ-PROCESSUS-NN : numéro suivant du compteur (jamais réutilisé,
  // même après suppression). Le pilote rejoint la cellule qu'il pilote — il en
  // répartit les tâches, il doit en être membre (cf. definirDispatcher) — et
  // quitte l'ancienne (poste libéré, plus dispatcher là-bas).
  async creer(societeId: string, dto: CreerCelluleDto) {
    const societe = await this.prisma.societe.findUniqueOrThrow({ where: { id: societeId }, select: { nom: true } });
    const pilote = dto.piloteId
      ? await this.prisma.collaborateur.findFirst({ where: { id: dto.piloteId, societeId } })
      : null;
    if (dto.piloteId && !pilote) throw new UnprocessableEntityException('Pilote introuvable dans la société.');
    const cellule = await this.prisma.$transaction(async (tx) => {
      const { dernier } = await tx.compteurCellule.upsert({
        where: { societeId_processus: { societeId, processus: dto.processus } },
        create: { societeId, processus: dto.processus, dernier: 1 },
        update: { dernier: { increment: 1 } },
      });
      const cel = await tx.cellule.create({
        data: {
          societeId,
          nom: dto.nom.trim(),
          processus: dto.processus,
          numero: dernier,
          code: codeCellule(prefixeSociete(societe.nom), dto.processus, dernier),
          clientele: dto.clientele,
          statut: dto.statut,
        },
      });
      if (pilote) {
        await quitterCellule(tx, pilote.id, pilote.celluleId);
        await tx.collaborateur.update({ where: { id: pilote.id }, data: { celluleId: cel.id } });
        await tx.cellule.update({ where: { id: cel.id }, data: { dispatcherId: pilote.id } });
      }
      return tx.cellule.findUniqueOrThrow({ where: { id: cel.id }, include: MEMBRES });
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

// Un collaborateur qui quitte sa cellule y libère son poste (« poste ouvert ·
// à affecter ») et n'en est plus le pilote (dispatcher).
export async function quitterCellule(tx: Prisma.TransactionClient, collaborateurId: string, celluleId: string | null) {
  if (!celluleId) return;
  await tx.posteCellule.updateMany({
    where: { celluleId, titulaireId: collaborateurId },
    data: { titulaireId: null, etat: 'ouvert' },
  });
  await tx.cellule.updateMany({ where: { id: celluleId, dispatcherId: collaborateurId }, data: { dispatcherId: null } });
}
