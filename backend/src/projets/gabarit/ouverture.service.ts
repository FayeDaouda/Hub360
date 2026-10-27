import { Injectable } from '@nestjs/common';
import { Categorie, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import type { ContenuGabarit } from '../../reglages/gabarit';
import { firstWorkday } from '../../projects/work-calendar';
import { instantiate, type GcCharges, type InstantiatedCard } from '../../projects/template-instantiation';

// Gabarit par catégorie : seule la conception a le sien (GC-CONCEPTION) ;
// un projet d'une autre catégorie ne s'ouvre pas selon un gabarit.
const GABARIT_PAR_CATEGORIE: Partial<Record<Categorie, string>> = { conception: 'GC-CONCEPTION' };

type Preparation = {
  projetId: string;
  j1: string;
  versionId: string;
  budgetHeures: number;
  cartes: InstantiatedCard[];
};

// Ouverture d'un projet (Réglages · « Ouverture du projet » : à l'émission
// de F1) : la version en service du gabarit est recopiée en cartes et tâches,
// délais figés. En deux temps pour garder la transaction d'émission courte :
// `preparer` lit réglages et gabarit, `enregistrer` écrit dans la transaction.
@Injectable()
export class OuvertureProjetService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
  ) {}

  // null : déjà ouvert, catégorie sans gabarit, ou société sans ce gabarit.
  async preparer(projetId: string, le: string): Promise<Preparation | null> {
    const projet = await this.prisma.projet.findUnique({
      where: { id: projetId },
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
    const code = projet && !projet.ouvertLe ? GABARIT_PAR_CATEGORIE[projet.categorie] : undefined;
    if (!projet || !code) return null;
    const version = await this.reglages.gabaritEnService(projet.societeId, code);
    if (!version) return null;

    const [feriesParSociete, chargesGc, budgetHeures] = await Promise.all([
      this.reglages.joursFeries([projet.societeId]),
      this.reglages.regle<GcCharges>(projet.societeId, 'charges_gc_heures'),
      this.reglages.regle<number>(projet.societeId, 'budget_atelier_heures'),
    ]);
    const feries = feriesParSociete.get(projet.societeId) ?? new Set<string>();
    const j1 = firstWorkday(le, feries);
    const codes = projet.devis.flatMap((d) => d.lignes.map((l) => l.produitService?.code));
    const cartes = instantiate(version.contenu as unknown as ContenuGabarit, {
      day1: j1,
      holidays: feries,
      gcCharges: chargesGc,
      spcOrdered: codes.includes('SPC'),
      individualClient: projet.client.type === 'particulier',
    });
    return { projetId, j1, versionId: version.id, budgetHeures, cartes };
  }

  // Idempotent : un projet déjà ouvert (émission concurrente, reprise de la
  // transaction) n'est pas recopié une seconde fois.
  async enregistrer(tx: Prisma.TransactionClient, p: Preparation): Promise<boolean> {
    const { count } = await tx.projet.updateMany({
      where: { id: p.projetId, ouvertLe: null },
      data: { ouvertLe: p.j1, gabaritVersionId: p.versionId, budgetHeures: p.budgetHeures },
    });
    if (count === 0) return false;
    for (const { taches, temps, ...carte } of p.cartes) {
      await tx.carteProjet.create({
        data: {
          ...carte,
          projetId: p.projetId,
          temps: (temps ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          taches: {
            create: taches.map((t) => ({ ...t, projetId: p.projetId, temps: t.temps as Prisma.InputJsonValue })),
          },
        },
      });
    }
    return true;
  }
}
