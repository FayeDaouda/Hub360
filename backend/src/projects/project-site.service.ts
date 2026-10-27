import { Injectable, NotFoundException } from '@nestjs/common';
import { Phase } from '@prisma/client';
import { addDays } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { PHASES_PAR_CATEGORIE } from '../projets/domaine/config';
import { SURVEY_CARD, type SiteStatus } from './project-query';

// Réglages d'un projet ouvert sur le terrain : statut du chantier et date de
// la visite sur site.
@Injectable()
export class ProjectSiteService {
  constructor(private prisma: PrismaService) {}

  // Statut simple « En conception / En chantier / Livré » (décision du
  // 14/10/2026) porté par Projet.phase : la facturation mensuelle SU/EX s'y
  // fie (« à facturer ce mois » en chantier). Revenir en conception remet la
  // première phase de la catégorie.
  async setSiteStatus(companyId: string, projectId: string, status: SiteStatus) {
    const p = await this.prisma.projet.findFirst({
      where: { id: projectId, societeId: companyId, ouvertLe: { not: null } },
      select: { id: true, categorie: true },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const phase: Phase = status === 'conception' ? PHASES_PAR_CATEGORIE[p.categorie][0] : status;
    await this.prisma.projet.update({ where: { id: projectId }, data: { phase } });
    return { statutChantier: status };
  }

  // Date de visite sur site : la carte « Relevés existants » et ses tâches
  // reçoivent leur fenêtre — du jour de la visite au lendemain (24 h
  // calendaires, week-end compris : règle du gabarit). Effacer la date
  // retire l'échéance.
  async setSiteVisitDate(companyId: string, projectId: string, date: string | null) {
    const p = await this.prisma.projet.findFirst({
      where: { id: projectId, societeId: companyId, ouvertLe: { not: null } },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Projet introuvable ou pas encore ouvert');
    const window = { debutLe: date, finLe: date ? addDays(date, 1) : null };
    await this.prisma.$transaction([
      this.prisma.projet.update({ where: { id: projectId }, data: { dateVisiteSite: date } }),
      this.prisma.carteProjet.updateMany({ where: { projetId: projectId, cle: SURVEY_CARD }, data: window }),
      this.prisma.tacheProjet.updateMany({ where: { projetId: projectId, carte: { cle: SURVEY_CARD } }, data: window }),
    ]);
    return { dateVisiteSite: date };
  }
}
