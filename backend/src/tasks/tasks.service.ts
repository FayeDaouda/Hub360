import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import type { SubmitTaskDto } from '../projects/open-projects.dto';
import type { TaskState } from '../projects/task-states';
import { CHIEF_CELL, chiefOf } from '../projects/project-query';
import { ProjectStatesService } from '../projects/project-states.service';
import { ReviewCircuitService } from '../projects/review-circuit.service';
import { reminderPossibleOn } from '../projects/task-reminder';
import { TaskReviewService } from '../projects/task-review.service';
import { TaskSubmissionService } from '../projects/task-submission.service';
import { decisionContext } from '../projects/decision-context';
import { canDecide, employeeOfAccount } from '../projects/review-rules';
import { ouDossierDuCompte } from '../rh/mon-compte';
import { arrondi, etatTache, heuresTache, joursAbsents, manqueTache } from '../rh/regles-temps';
import {
  effectiveDue,
  isLate,
  onTime,
  performanceStats,
  statusFromProjectState,
  taskStatus,
  templateValidationState,
} from './task-rules';
import { loadAssignedTasks } from './assigned-tasks';
import type { MyTasksViewDto, PerformanceStatsDto } from './my-tasks-view.dto';
import type { SubmissionFileDto } from '../projects/open-projects-view.dto';
import type { TaskToReviewDto } from './task-review.dto';
import { todayIso } from '@hub/domain';

type Actor = { userId: string; societeId: string; role: string };

const fullName = (c: { prenom: string; nom: string }) => `${c.prenom} ${c.nom}`.trim();

// Mes tâches, Mon espace (Mes performances, À valider, Ma cellule) : les
// tâches du gabarit (TacheProjet) assignées, depuis oct. 2026. La remise et
// la validation passent par les services des tâches de Projets : mêmes règles que la page
// Projets (l'assigné remet ; le chef de team valide, l'Architecte DPLG
// supplée ; jamais sa propre tâche).
@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private taskSubmission: TaskSubmissionService,
    private taskReview: TaskReviewService,
    private reviewCircuit: ReviewCircuitService,
    private projectStates: ProjectStatesService,
  ) {}

  // État de chaque tâche des projets ouverts, selon la règle commune.
  private async taskStates(companyId: string, day: string): Promise<Map<string, TaskState>> {
    return new Map((await this.projectStates.companyStates(companyId, day)).flatMap((p) => [...p.taskStates]));
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
    const employeeId = file?.collaborateurId ?? (await employeeOfAccount(this.prisma, a.societeId, a.userId));
    const tasks = employeeId ? await loadAssignedTasks(this.prisma, [employeeId]) : [];
    const companyId = file?.societeId ?? a.societeId;
    const holidays = (await this.reglages.joursFeries([companyId])).get(companyId)!;
    const absent = joursAbsents(
      (file?.absences ?? []).map((x) => ({ debut: x.dateDebut, fin: x.dateFin })),
      holidays,
    );
    const states = tasks.length ? await this.taskStates(companyId, today) : new Map<string, TaskState>();
    // Qui valide (mêmes personnes que celles prévenues au dépôt) : dès qu'une
    // tâche est à déposer (message du dépôt) ou en validation (« Chez mon
    // N+1 »), et quand une relance devient possible (3 jours ouvrés).
    const open = tasks.filter((t) => t.statut === 'a_faire' || t.statut === 'reprise' || t.statut === 'a_valider');
    const reviewers = await this.reviewCircuit.reviewerNames(
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
        // Date de la remise, seulement quand elle compte (en validation, validée).
        const remisLe = t.statut === 'a_valider' || t.statut === 'validee' ? t.remisLe : null;
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
          remisLe,
          aTemps: onTime({ echeance: t.echeance, remisLe }),
          valideLe: t.valideeLe,
          renvoiMotif: t.renvoiMotif,
          validateur: reviewers.get(t.id) ?? null,
          etapeNumero: t.etapeNumero,
          fichierObligatoire: t.fichierObligatoire,
          parDepot: t.parDepot,
          relancePossibleLe:
            t.statut === 'a_valider' && t.remisLe ? reminderPossibleOn(t.remisLe, t.derniereRelance, holidays) : null,
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
    const states = companyId && tasks.length ? await this.taskStates(companyId, today) : new Map<string, TaskState>();
    return performanceStats(
      tasks.map((t) => ({
        statut: statusFromProjectState(taskStatus(t, templateValidationState(t), today), states.get(t.id)),
        echeance: t.echeance,
        remisLe: t.remisLe,
        version: t.version,
      })),
    );
  }

  async submit(a: Actor, projectId: string, taskId: string, body: SubmitTaskDto = {}) {
    await this.taskSubmission.submit(a.societeId, a, projectId, taskId, body);
    return this.myTasks(a);
  }

  async remind(a: Actor, projectId: string, taskId: string) {
    await this.taskSubmission.remind(a.societeId, a, projectId, taskId);
    return this.myTasks(a);
  }

  // --- Le valideur : remises qui l'attendent ----------------------------------
  async toReview(a: Actor): Promise<TaskToReviewDto[]> {
    const employeeId = await employeeOfAccount(this.prisma, a.societeId, a.userId);
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
            cellules: CHIEF_CELL,
          },
        },
        evenements: { where: { type: 'remise' }, orderBy: { creeLe: 'desc' }, take: 1, select: { creeLe: true } },
        pieces: { orderBy: { createdAt: 'asc' }, select: { id: true, nom: true, version: true } },
      },
    });
    // Mêmes règles que Projets : suppléance du jour, travail d'un Dir. GC au CTO.
    const ctx = await decisionContext(this.prisma, a.societeId, todayIso());
    return submissions
      .filter((t) =>
        canDecide(
          { role: a.role, employeeId, ctoStandsIn: ctx.ctoStandsIn },
          { ...t, assigneeIsDplg: !!t.assigneId && ctx.dplgEmployees.has(t.assigneId) },
          chiefOf(t.projet),
        ),
      )
      .map((t) => {
        const remisLe = t.evenements[0]?.creeLe ?? null;
        return {
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
          remisLe,
          aTemps: onTime({ echeance: t.finLe, remisLe }),
          // Fichiers de la remise à valider (vide = « sans fichier joint »).
          pieces: t.pieces.filter((f) => f.version === t.version).map((f) => ({ id: f.id, nom: f.nom })),
        };
      })
      .sort((x, y) => (x.remisLe?.getTime() ?? 0) - (y.remisLe?.getTime() ?? 0));
  }

  async submissionFile(a: Actor, projectId: string, taskId: string, fileId: string): Promise<SubmissionFileDto> {
    await this.taskSubmission.checkFileAccess(a.societeId, a, projectId, taskId);
    return this.taskSubmission.submissionFile(a.societeId, projectId, taskId, fileId);
  }

  async decide(
    a: Actor,
    projectId: string,
    taskId: string,
    body: { decision: 'valider' | 'renvoyer'; motif?: string },
  ) {
    await this.taskReview.decide(a.societeId, a, projectId, taskId, body.decision, body.motif);
    return this.toReview(a);
  }
}
