import { Injectable } from '@nestjs/common';
import { Categorie, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ContenuGabarit } from '../reglages/gabarit';
import { ReglagesService } from '../reglages/reglages.service';
import { instantiate, type GcCharges, type InstantiatedCard } from './template-instantiation';
import { firstWorkday } from './work-calendar';

// Gabarit par catégorie : seule la conception a le sien (GC-CONCEPTION) ;
// un projet d'une autre catégorie ne s'ouvre pas selon un gabarit.
const TEMPLATE_BY_CATEGORY: Partial<Record<Categorie, string>> = { conception: 'GC-CONCEPTION' };

export type OpeningPlan = {
  projectId: string;
  day1: string;
  versionId: string;
  budgetHours: number;
  cards: InstantiatedCard[];
};

// Ouverture d'un projet (Réglages · « Ouverture du projet » : à l'émission
// de F1) : la version en service du gabarit est recopiée en cartes et tâches,
// délais figés. En deux temps pour garder la transaction d'émission courte :
// `prepare` lit réglages et gabarit, `save` écrit dans la transaction.
@Injectable()
export class ProjectOpeningService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  // null : déjà ouvert, catégorie sans gabarit, ou société sans ce gabarit.
  async prepare(projectId: string, on: string): Promise<OpeningPlan | null> {
    const project = await this.prisma.projet.findUnique({
      where: { id: projectId },
      select: {
        societeId: true,
        categorie: true,
        ouvertLe: true,
        client: { select: { type: true } },
        devis: {
          where: { statut: 'transforme' },
          select: { lignes: { select: { produitService: { select: { code: true } } } } },
        },
      },
    });
    const code = project && !project.ouvertLe ? TEMPLATE_BY_CATEGORY[project.categorie] : undefined;
    if (!project || !code) return null;
    const version = await this.reglages.gabaritEnService(project.societeId, code);
    if (!version) return null;

    const [holidaysByCompany, gcCharges, budgetHours] = await Promise.all([
      this.reglages.joursFeries([project.societeId]),
      this.reglages.regle<GcCharges>(project.societeId, 'charges_gc_heures'),
      this.reglages.regle<number>(project.societeId, 'budget_atelier_heures'),
    ]);
    const holidays = holidaysByCompany.get(project.societeId) ?? new Set<string>();
    const day1 = firstWorkday(on, holidays);
    const productCodes = project.devis.flatMap((d) => d.lignes.map((l) => l.produitService?.code));
    const cards = instantiate(version.contenu as unknown as ContenuGabarit, {
      day1,
      holidays,
      gcCharges,
      spcOrdered: productCodes.includes('SPC'),
      individualClient: project.client.type === 'particulier',
    });
    return { projectId, day1, versionId: version.id, budgetHours, cards };
  }

  // Idempotent : un projet déjà ouvert (émission concurrente, reprise de la
  // transaction) n'est pas recopié une seconde fois.
  async save(tx: Prisma.TransactionClient, plan: OpeningPlan): Promise<boolean> {
    const { count } = await tx.projet.updateMany({
      where: { id: plan.projectId, ouvertLe: null },
      data: { ouvertLe: plan.day1, gabaritVersionId: plan.versionId, budgetHeures: plan.budgetHours },
    });
    if (count === 0) return false;
    for (const { taches, temps, ...card } of plan.cards) {
      await tx.carteProjet.create({
        data: {
          ...card,
          projetId: plan.projectId,
          temps: (temps ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          taches: {
            create: taches.map((t) => ({ ...t, projetId: plan.projectId, temps: t.temps as Prisma.InputJsonValue })),
          },
        },
      });
    }
    return true;
  }
}
