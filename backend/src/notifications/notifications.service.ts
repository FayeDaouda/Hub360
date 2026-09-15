import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { avancementChecklistAvp } from '../projets/domaine/gardes';

// Fenêtre « échéance proche » d'un avant-projet — miroir du SEUIL_JOURS de
// frontend/app/collab/[slug]/page.tsx (worklist). En deçà (ou dépassé) →
// alerte dérivée.
const SEUIL_JOURS = 14;
const MAX_STOCKEES = 30;

type ProjetContexte = {
  id: string;
  code: string;
  celluleId: string | null;
};

export type NotificationItem = {
  id: string; // uuid (stockée) | « echeance:<projetId> » (dérivée)
  type: NotificationType | 'echeance_avant_projet';
  titre: string;
  projetId: string | null;
  projetCode: string | null;
  date: Date;
  lu: boolean;
  derivee: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // -- Écriture : appelée par ProjetsService au moment de l'événement --------
  // Best-effort : un échec de fan-out ne doit pas faire échouer l'assignation
  // ou le changement de phase (try/catch côté appelant).
  async pousser(params: {
    societeId: string;
    projet: ProjetContexte;
    type: NotificationType;
    titre: string;
    parId?: string | null;
  }): Promise<void> {
    const destinataires = await this.destinataires(
      params.societeId,
      params.projet,
      params.parId ?? null,
    );
    if (destinataires.length === 0) return;

    await this.prisma.notification.createMany({
      data: destinataires.map((destinataireId) => ({
        destinataireId,
        societeId: params.societeId,
        type: params.type,
        projetId: params.projet.id,
        titre: params.titre,
        parId: params.parId ?? null,
      })),
    });
  }

  // -- Lecture : flux du collaborateur connecté -----------------------------
  async flux(societeId: string, utilisateurId: string) {
    const [stockees, derivees] = await Promise.all([
      this.prisma.notification.findMany({
        where: { destinataireId: utilisateurId, societeId },
        include: { projet: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_STOCKEES,
      }),
      this.echeancesDerivees(societeId, utilisateurId),
    ]);

    const elementsStockes: NotificationItem[] = stockees.map((n) => ({
      id: n.id,
      type: n.type,
      titre: n.titre,
      projetId: n.projetId,
      projetCode: n.projet?.code ?? null,
      date: n.createdAt,
      lu: n.luLe !== null,
      derivee: false,
    }));

    const nonLues =
      elementsStockes.filter((e) => !e.lu).length + derivees.length;

    return { nonLues, elements: [...derivees, ...elementsStockes] };
  }

  async marquerLues(societeId: string, utilisateurId: string) {
    await this.prisma.notification.updateMany({
      where: { destinataireId: utilisateurId, societeId, luLe: null },
      data: { luLe: new Date() },
    });
    return this.flux(societeId, utilisateurId);
  }

  // -- Internes -----------------------------------------------------------

  // utilisateurId des collaborateurs qui « suivent » le projet : membres de sa
  // cellule + dessinateur + responsable 3D, comptes existants seulement, hors
  // l'auteur de l'action.
  private async destinataires(
    societeId: string,
    projet: ProjetContexte,
    exclusId: string | null,
  ): Promise<string[]> {
    const ap = await this.prisma.avantProjet.findUnique({
      where: { projetId: projet.id },
      select: { dessinateurId: true, responsable3dId: true },
    });
    const collabIds = [ap?.dessinateurId, ap?.responsable3dId].filter(
      (v): v is string => !!v,
    );

    const ou: Prisma.CollaborateurWhereInput[] = [];
    if (projet.celluleId) ou.push({ celluleId: projet.celluleId });
    if (collabIds.length) ou.push({ id: { in: collabIds } });
    if (ou.length === 0) return [];

    const collabs = await this.prisma.collaborateur.findMany({
      where: { societeId, utilisateurId: { not: null }, OR: ou },
      select: { utilisateurId: true },
    });

    const ids = new Set<string>();
    for (const c of collabs) {
      if (c.utilisateurId && c.utilisateurId !== exclusId) ids.add(c.utilisateurId);
    }
    return [...ids];
  }

  // Alertes d'échéance d'avant-projet, calculées à la volée (pas de scheduler) :
  // avant-projet ni validé ni bouclé, dont la date de fin est passée ou dans
  // moins de SEUIL_JOURS. Même logique que la worklist de l'accueil.
  private async echeancesDerivees(
    societeId: string,
    utilisateurId: string,
  ): Promise<NotificationItem[]> {
    const collab = await this.prisma.collaborateur.findFirst({
      where: { societeId, utilisateurId },
      select: { id: true, celluleId: true },
    });
    if (!collab) return [];

    const ou: Prisma.ProjetWhereInput[] = [
      { avantProjet: { dessinateurId: collab.id } },
      { avantProjet: { responsable3dId: collab.id } },
    ];
    if (collab.celluleId) ou.push({ celluleId: collab.celluleId });

    const projets = await this.prisma.projet.findMany({
      where: { societeId, phase: { not: 'livre' }, OR: ou },
      select: {
        id: true,
        code: true,
        avantProjet: {
          select: {
            dateFin: true,
            valideLe: true,
            lignesChecklist: { select: { fait: true } },
          },
        },
      },
    });

    const items: NotificationItem[] = [];
    for (const p of projets) {
      const ap = p.avantProjet;
      if (!ap?.dateFin) continue;
      const boucle =
        ap.valideLe !== null || avancementChecklistAvp(ap.lignesChecklist).complete;
      if (boucle) continue;
      const jours = joursAvant(ap.dateFin);
      if (jours === null || jours > SEUIL_JOURS) continue;
      items.push({
        id: `echeance:${p.id}`,
        type: 'echeance_avant_projet',
        titre: `${p.code} — avant-projet ${etiquetteEcheance(jours)}`,
        projetId: p.id,
        projetCode: p.code,
        date: new Date(),
        lu: false,
        derivee: true,
      });
    }
    return items.sort((a, b) => a.titre.localeCompare(b.titre));
  }
}

function joursAvant(dateFin: string): number | null {
  const fin = Date.parse(`${dateFin}T23:59:59`);
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

function etiquetteEcheance(jours: number): string {
  if (jours < 0) return `en retard de ${-jours} j`;
  if (jours === 0) return 'à rendre aujourd’hui';
  return `à rendre dans ${jours} j`;
}
