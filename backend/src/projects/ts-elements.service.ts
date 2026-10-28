import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_CTO, todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import type { Temps } from '../reglages/gabarit';
import { decisionContext } from './decision-context';
import { actsAsDplg, assertInCircuit } from './review-rules';
import { TS_UNITS, type Actor } from './project-query';

// « Ajouter en TS » (Architecte DPLG) : un élément demandé par le client
// devient une tâche de la carte « par unité » (pièce, vue), avec le temps de
// la carte, ajouté au budget atelier du projet.
@Injectable()
export class TsElementsService {
  constructor(private prisma: PrismaService) {}

  async add(companyId: string, actor: Actor, projectId: string, cardId: string, element: string) {
    assertInCircuit(actor.role);
    // Seuil et suppléance vérifiés en amont (AvenantsTsService) ; ici, le rôle.
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    if (!actsAsDplg({ role: actor.role, employeeId: null, ctoStandsIn: ctx.ctoStandsIn }) && actor.role !== ROLE_CTO) {
      throw new ForbiddenException('Ajouter en TS est réservé à l’Architecte DPLG (ou au CTO).');
    }
    const card = await this.prisma.carteProjet.findFirst({
      where: { id: cardId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        debutJ: true,
        finJ: true,
        debutLe: true,
        finLe: true,
        temps: true,
        desactivation: true,
        taches: { select: { ordre: true } },
      },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    const time = card.temps as Temps | null;
    if (card.desactivation || time?.type !== 'par_unite')
      throw new ConflictException('Cette carte ne reçoit pas d’élément en TS.');

    return this.prisma.$transaction(async (tx) => {
      const rank = (await tx.tacheProjet.count({ where: { projetId: projectId, cle: { startsWith: 'ts_' } } })) + 1;
      const task = await tx.tacheProjet.create({
        data: {
          projetId: projectId,
          carteId: card.id,
          cle: `ts_${rank}`,
          libelle: `TS${rank} · ${TS_UNITS[time.unite]} · ${element.trim()}`,
          ordre: Math.max(-1, ...card.taches.map((t) => t.ordre)) + 1,
          debutJ: card.debutJ,
          finJ: card.finJ,
          debutLe: card.debutLe,
          finLe: card.finLe,
          temps: { type: 'heures', heures: time.heures } satisfies Temps as Prisma.InputJsonValue,
          heures: time.heures,
        },
        select: { id: true, libelle: true },
      });
      await tx.projet.update({ where: { id: projectId }, data: { budgetHeures: { increment: time.heures } } });
      return task;
    });
  }
}
