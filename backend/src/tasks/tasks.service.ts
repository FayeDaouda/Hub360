import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import type { RemettreTacheDto } from '../projets/gabarit/dto';
import type { EtatTache } from '../projets/gabarit/etats';
import { ProjetsOuvertsService } from '../projets/gabarit/projets-ouverts.service';
import { relancePossibleLe, TachesProjetService } from '../projets/gabarit/taches-projet.service';
import { contexteDecision } from '../projets/gabarit/suppleance';
import { collaborateurDuCompte, peutDecider } from '../projets/gabarit/validation';
import { ouDossierDuCompte } from '../rh/mon-compte';
import { arrondi, etatTache, heuresTache, joursAbsents, manqueTache } from '../rh/regles-temps';
import {
  effectiveDue,
  isLate,
  performanceStats,
  statusFromProjectState,
  taskStatus,
  templateValidationState,
} from './task-rules';
import { loadAssignedTasks } from './assigned-tasks';
import type { MyTasksViewDto, PerformanceStatsDto } from './my-tasks-view.dto';
import type { SubmissionFileDto, TaskToReviewDto } from './task-review.dto';
import { todayIso } from '@hub/domain';

type Actor = { userId: string; societeId: string; role: string };

const fullName = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`.trim();

// Mes tâches, Mon espace (Mes performances, À valider, Ma cellule) : les
// tâches du gabarit (TacheProjet) assignées, depuis oct. 2026. La remise et
// la validation passent par TachesProjetService : mêmes règles que la page
// Projets (l'assigné remet ; le chef de team valide, l'Architecte DPLG
// supplée ; jamais sa propre tâche).
@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private projectTasks: TachesProjetService,
    private openProjects: ProjetsOuvertsService,
  ) {}

  // État de chaque tâche des projets ouverts, selon la règle commune.
  private async projectStates(companyId: string, day: string): Promise<Map<string, EtatTache>> {
    return new Map((await this.openProjects.etatsSociete(companyId, day)).flatMap((p) => [...p.etatsTaches]));
  }

  // --- L'assigné : ses tâches, leur temps et leur état de validation ---------
  async myTasks(a: Actor): Promise<MyTasksViewDto> {
    const today = todayIso();
    const file = await this.prisma.dossierPersonnel.findFirst({
      where: ouDossierDuCompte(a.userId),
      select: {
        collaborateurId: true,
        societeId: true,
        absences: { where: { statut: 'validee' }, select: { dateDebut: true, dateFin: true } },
      },
    });
    const employeeId = file?.collaborateurId ?? (await collaborateurDuCompte(this.prisma, a.societeId, a.userId));
    const tasks = employeeId ? await loadAssignedTasks(this.prisma, [employeeId]) : [];
    const companyId = file?.societeId ?? a.societeId;
    const holidays = (await this.reglages.joursFeries([companyId])).get(companyId)!;
    const absent = joursAbsents(
      (file?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })),
      holidays,
    );
    const states = tasks.length ? await this.projectStates(companyId, today) : new Map<string, EtatTache>();
    // Qui valide (mêmes personnes que celles prévenues au dépôt) : dès qu'une
    // tâche est à déposer (message du dépôt) ou en validation (« Chez mon
    // N+1 »), et quand une relance devient possible (3 jours ouvrés).
    const open = tasks.filter((t) => t.statut === 'a_faire' || t.statut === 'reprise' || t.statut === 'a_valider');
    const reviewers = await this.projectTasks.nomsValideurs(
      companyId,
      open.filter((t) => !t.parDepot).map((t) => ({ id: t.id, assigneId: t.collaborateurId, chefId: t.chefId })),
    );

    const rows = tasks
      .map((t) => {
        const planned = !!t.debut && !!t.echeance;
        const state = states.get(t.id);
        const statut = statusFromProjectState(taskStatus(t, templateValidationState(t), today), state);
        // Retard qualifié : la nouvelle date accordée (l'échéance de référence reste).
        const prolongeeJusquau = state?.code === 'prolongee' ? state.jusquau : null;
        const due = { statut, echeance: t.echeance, prolongeeJusquau };
        return {
          id: t.id,
          etape: t.etape,
          carte: t.carte,
          libelle: t.libelle,
          projetId: t.projetId,
          projetCode: t.projetCode,
          projetProgramme: t.projetProgramme,
          projetClient: t.projetClient,
          debut: t.debut,
          echeance: t.echeance,
          dureeStandard: t.heures,
          heuresImputees: planned ? arrondi(heuresTache(t, absent, { debut: t.debut!, fin: today }, holidays)) : 0,
          manque: manqueTache(t, absent, holidays),
          etat: etatTache(t, today),
          statut,
          enRetard: isLate(due, today),
          dateEffective: effectiveDue(due),
          prolongeeJusquau,
          version: t.version,
          remisLe: t.statut === 'a_valider' || t.statut === 'validee' ? t.remisLe : null,
          valideLe: t.valideeLe,
          renvoiMotif: t.renvoiMotif,
          validateur: reviewers.get(t.id) ?? null,
          etapeNumero: t.etapeNumero,
          fichierObligatoire: t.fichierObligatoire,
          parDepot: t.parDepot,
          relancePossibleLe:
            t.statut === 'a_valider' && t.remisLe ? relancePossibleLe(t.remisLe, t.derniereRelance, holidays) : null,
        };
      })
      .sort((x, y) => (x.echeance ?? '9999').localeCompare(y.echeance ?? '9999'));

    return { taches: rows, stats: performanceStats(rows) };
  }

  // Statistiques d'une équipe (« Ma cellule ») : mêmes règles que « Mes
  // performances », sur les tâches de tous ses membres.
  async teamStats(employeeIds: string[], companyId?: string): Promise<PerformanceStatsDto> {
    const today = todayIso();
    const tasks = await loadAssignedTasks(this.prisma, employeeIds);
    const states =
      companyId && tasks.length ? await this.projectStates(companyId, today) : new Map<string, EtatTache>();
    return performanceStats(
      tasks.map((t) => ({
        statut: statusFromProjectState(taskStatus(t, templateValidationState(t), today), states.get(t.id)),
        echeance: t.echeance,
        remisLe: t.remisLe,
      })),
    );
  }

  async submit(a: Actor, projectId: string, taskId: string, body: RemettreTacheDto = {}) {
    await this.projectTasks.remettre(a.societeId, a, projectId, taskId, body);
    return this.myTasks(a);
  }

  async remind(a: Actor, projectId: string, taskId: string) {
    await this.projectTasks.relancer(a.societeId, a, projectId, taskId);
    return this.myTasks(a);
  }

  // --- Le valideur : remises qui l'attendent ----------------------------------
  async toReview(a: Actor): Promise<TaskToReviewDto[]> {
    const employeeId = await collaborateurDuCompte(this.prisma, a.societeId, a.userId);
    const submissions = await this.prisma.tacheProjet.findMany({
      where: { statut: 'a_valider', projet: { societeId: a.societeId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        libelle: true,
        version: true,
        debutLe: true,
        finLe: true,
        assigneId: true,
        assigne: { select: { prenom: true, nom: true } },
        carte: { select: { etapeNumero: true, etapeLibelle: true } },
        projet: {
          select: {
            id: true,
            code: true,
            programme: true,
            cellules: { take: 1, select: { cellule: { select: { dispatcherId: true } } } },
          },
        },
        evenements: { where: { type: 'remise' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
        pieces: { orderBy: { createdAt: 'asc' }, select: { id: true, nom: true, version: true } },
      },
    });
    // Mêmes règles que Projets : suppléance du jour, travail d'un Dir. GC au CTO.
    const ctx = await contexteDecision(this.prisma, a.societeId, todayIso());
    return submissions
      .filter((t) =>
        peutDecider(
          { role: a.role, collaborateurId: employeeId, ctoSupplee: ctx.ctoSupplee },
          { ...t, assigneEstDplg: !!t.assigneId && ctx.dplgCollaborateurs.has(t.assigneId) },
          t.projet.cellules[0]?.cellule.dispatcherId ?? null,
        ),
      )
      .map((t) => ({
        id: t.id,
        etape: `${String(t.carte.etapeNumero).padStart(2, '0')} · ${t.carte.etapeLibelle}`,
        libelle: t.libelle,
        version: t.version,
        projetId: t.projet.id,
        projetCode: t.projet.code,
        projetProgramme: t.projet.programme,
        responsable: t.assigne ? fullName(t.assigne) : '—',
        debut: t.debutLe,
        echeance: t.finLe,
        remisLe: t.evenements[0]?.creeLe ?? null,
        // Fichiers de la remise à valider (vide = « sans fichier joint »).
        pieces: t.pieces.filter((f) => f.version === t.version).map((f) => ({ id: f.id, nom: f.nom })),
      }))
      .sort((x, y) => (x.remisLe?.getTime() ?? 0) - (y.remisLe?.getTime() ?? 0));
  }

  async submissionFile(a: Actor, projectId: string, taskId: string, fileId: string): Promise<SubmissionFileDto> {
    await this.projectTasks.verifierAccesPiece(a.societeId, a, projectId, taskId);
    return this.projectTasks.piece(a.societeId, projectId, taskId, fileId);
  }

  async decide(
    a: Actor,
    projectId: string,
    taskId: string,
    body: { decision: 'valider' | 'renvoyer'; motif?: string },
  ) {
    await this.projectTasks.decider(a.societeId, a, projectId, taskId, body.decision, body.motif);
    return this.toReview(a);
  }
}
