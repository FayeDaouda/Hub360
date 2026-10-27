import { Injectable } from '@nestjs/common';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { alerteAvenant } from '../devis/domaine';
import { invoiceWaits } from './task-states';
import { invoicesOf, WITH_TASKS } from './project-query';
import { ProjectStatesService } from './project-states.service';

type Tranche = 'F1' | 'F2' | 'F3';

// Ce qui demande l'attention de la direction (accueil du CEO, Pilotage) —
// mêmes états que la vue Projets : tâches en retard par projet ouvert (dont
// retards qualifiés par une prolongation), tranches F1 à F3 prêtes et pas
// encore émises, avenants TS non acceptés au-delà du délai réglé.
@Injectable()
export class ProjectAlertsService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private states: ProjectStatesService,
  ) {}

  async alerts(companyId: string) {
    const today = todayIso();
    const [projects, notOpened, holidays, tsThreshold] = await Promise.all([
      this.prisma.projet.findMany({
        where: { societeId: companyId, ouvertLe: { not: null } },
        orderBy: { ouvertLe: 'asc' },
        include: {
          ...WITH_TASKS,
          client: { select: { nom: true } },
          factures: {
            where: { estAvoir: false, statut: { not: 'annulee' } },
            select: { id: true, jalon: true, statut: true },
          },
        },
      }),
      // F1 émise = projet ouvert : un projet signé dont F1 attend encore.
      this.prisma.projet.findMany({
        where: {
          societeId: companyId,
          ouvertLe: null,
          factures: { some: { jalon: 'signature', statut: 'brouillon', estAvoir: false } },
        },
        select: {
          id: true,
          code: true,
          client: { select: { nom: true } },
          factures: {
            where: { jalon: 'signature', statut: 'brouillon', estAvoir: false },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.states.holidays(companyId),
      this.reglages.regle<number>(companyId, 'alerte_avenant_jours'),
    ]);
    const tsQuotes = await this.prisma.devis.findMany({
      where: { societeId: companyId, projetId: { in: projects.map((p) => p.id) }, statut: 'envoye' },
      select: {
        id: true,
        projetId: true,
        statut: true,
        dateValidite: true,
        dateEnvoi: true,
        lignes: {
          orderBy: { ordre: 'asc' },
          select: { designation: true, produitService: { select: { famille: true } } },
        },
      },
    });

    const delays: {
      projetId: string;
      code: string;
      client: string;
      enRetard: number;
      prolongees: number;
      joursMax: number;
    }[] = [];
    const tranches: { projetId: string; code: string; client: string; tranche: Tranche; factureId: string | null }[] =
      notOpened.map((p) => ({
        projetId: p.id,
        code: p.code,
        client: p.client.nom,
        tranche: 'F1' as const,
        factureId: p.factures[0]?.id ?? null,
      }));
    for (const p of projects) {
      const { etapes, taskStates } = this.states.states(p, today, holidays);
      const states = [...taskStates.values()];
      const late = states.filter((e) => e.code === 'en_retard').length;
      const extended = states.filter((e) => e.code === 'prolongee').length;
      if (late || extended) {
        const maxDays = Math.max(...states.map((e) => (e.code === 'en_retard' ? e.jours : 0)));
        delays.push({
          projetId: p.id,
          code: p.code,
          client: p.client.nom,
          enRetard: late,
          prolongees: extended,
          joursMax: maxDays,
        });
      }
      const waiting = invoiceWaits(etapes, this.states.cardSources(p));
      for (const f of ['F2', 'F3'] as const) {
        const invoices = invoicesOf(p.factures, f);
        if (waiting[f].length || invoices.some((x) => x.statut === 'emise')) continue;
        tranches.push({
          projetId: p.id,
          code: p.code,
          client: p.client.nom,
          tranche: f,
          factureId: invoices[0]?.id ?? null,
        });
      }
    }
    const codeOf = new Map(projects.map((p) => [p.id, p.code]));
    const ts = tsQuotes.flatMap((d) => {
      const alert = alerteAvenant(
        { ...d, familles: d.lignes.map((l) => l.produitService?.famille ?? null) },
        today,
        tsThreshold,
      );
      if (!alert) return [];
      const designations = d.lignes.filter((l) => l.produitService?.famille === 'TS').map((l) => l.designation);
      return [
        {
          devisId: d.id,
          projetId: d.projetId!,
          code: codeOf.get(d.projetId!) ?? '—',
          objet: designations.join(' · '),
          jours: alert.jours,
          seuil: alert.seuil,
        },
      ];
    });
    return { retards: delays, tranches, ts };
  }
}
