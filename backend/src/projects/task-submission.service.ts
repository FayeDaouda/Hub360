import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatDate, plural, todayIso, toIsoDay } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import type { Temps } from '../reglages/gabarit';
import type { SubmitTaskDto } from './open-projects.dto';
import { workdaysAfter } from './work-calendar';
import { submissionFileName } from './submission-file-name';
import { decisionContext } from './decision-context';
import { assertInCircuit, canQualify, employeeOfAccount } from './review-rules';
import { CHIEF_CELL, chiefOf, versionLabel, type Actor } from './project-query';
import { ReviewCircuitService } from './review-circuit.service';
import { reminderPossibleOn } from './task-reminder';
import type { SubmissionResultDto } from './open-projects-view.dto';

// Remise d'une tâche par la personne assignée, relance de son validateur et
// accès aux fichiers déposés (maquette « Projets », vue Salarié ; Mes tâches).
@Injectable()
export class TaskSubmissionService {
  constructor(
    private prisma: PrismaService,
    private reglages: ReglagesService,
    private circuit: ReviewCircuitService,
  ) {}

  // Seul l'assigné remet sa tâche, ouverte (carte non verrouillée), à faire
  // ou en reprise. Sans temps atelier, le dépôt vaut validation (exception
  // écrite au principe 4) ; sinon la remise vNN attend le chef de team (ou le
  // DPLG pour la tâche du chef).
  async submit(
    companyId: string,
    actor: Actor,
    projectId: string,
    taskId: string,
    body: SubmitTaskDto = {},
  ): Promise<SubmissionResultDto> {
    assertInCircuit(actor.role);
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        version: true,
        temps: true,
        assigneId: true,
        cle: true,
        fichierObligatoire: true,
        carte: {
          select: {
            desactivation: true,
            ouvreApres: true,
            etapeNumero: true,
            taches: {
              where: { visaRequis: true, statut: 'validee', visaLe: null, visaNonTrace: false },
              select: { libelle: true },
            },
          },
        },
        projet: { select: { code: true, cellules: CHIEF_CELL } },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    if (!employeeId || employeeId !== task.assigneId)
      throw new ForbiddenException('Seule la personne assignée remet sa tâche.');
    if (task.statut !== 'a_faire' && task.statut !== 'reprise')
      throw new ConflictException('Cette tâche n’attend pas de remise.');
    if (task.carte.desactivation) throw new ConflictException('Carte désactivée : rien à déposer.');
    if (await this.cardLocked(projectId, task.carte.ouvreApres)) {
      throw new ConflictException('La carte s’ouvre quand les tâches dont elle dépend sont validées.');
    }
    // Le dépôt du permis attend les plans visés par l'architecte DPLG.
    if (task.cle === 'depot' && task.carte.taches.length) {
      throw new ConflictException(
        `Dépôt impossible : visa DPLG attendu sur ${task.carte.taches.map((t) => `« ${t.libelle} »`).join(', ')}.`,
      );
    }

    const received = body.pieces ?? [];
    if (received.some((f) => !f.url.startsWith('data:'))) throw new BadRequestException('Fichier invalide.');
    if (task.fichierObligatoire && received.length === 0)
      throw new BadRequestException('Joignez au moins un fichier : il est obligatoire pour cette tâche.');
    const version = task.version + 1;
    const vNN = versionLabel(version);
    // Renommés selon la règle du HUB (CODE_ÉTAPE_TÂCHE_vNN) : personne n'a à la retenir.
    const files = received.map((f, rang) => ({
      ...f,
      nom: submissionFileName({
        code: task.projet.code,
        etapeNumero: task.carte.etapeNumero,
        task: task.libelle,
        version,
        originalName: f.nom,
        rank: rang,
        total: received.length,
      }),
    }));
    const byDeposit = (task.temps as Temps).type === 'sans';
    const comment = body.commentaire?.trim();
    const detail = [
      `Remise ${vNN}`,
      files.length ? `${plural(files.length, 'fichier')}` : 'sans fichier joint',
      ...(comment ? [`« ${comment} »`] : []),
    ].join(' · ');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: task.id, statut: { in: ['a_faire', 'reprise'] } },
        data: byDeposit
          ? { statut: 'validee', version, valideeLe: new Date(), valideeParId: actor.userId }
          : { statut: 'a_valider', version },
      });
      if (!count) throw new ConflictException('La tâche a changé entre-temps.');
      await tx.evenementTacheProjet.create({
        data: { tacheId: task.id, type: 'remise', parId: actor.userId, detail },
      });
      if (files.length) {
        await tx.pieceRemiseTache.createMany({
          data: files.map((f) => ({ tacheId: task.id, version, nom: f.nom, cle: f.url, ajouteParId: actor.userId })),
        });
      }
      if (byDeposit) {
        await tx.evenementTacheProjet.create({
          data: {
            tacheId: task.id,
            type: 'validation',
            parId: actor.userId,
            detail: 'Dépôt du justificatif : vaut validation',
          },
        });
      }
    });

    if (!byDeposit) {
      const ctx = await decisionContext(this.prisma, companyId, todayIso());
      await this.circuit.notify(
        companyId,
        projectId,
        task.projet.code,
        'tache_remise',
        `Remise ${vNN} à valider · ${task.projet.code} · ${task.libelle}`,
        actor.userId,
        await this.circuit.reviewers(ctx, employeeId, chiefOf(task.projet)),
      );
    }
    return { statut: byDeposit ? 'validee' : 'a_valider', version };
  }

  // Relance du validateur par l'assigné (Mes tâches, lot D, règle validée le
  // 23/10/2026) : possible 3 jours ouvrés après le dépôt, puis 3 jours ouvrés
  // après la relance précédente. Prévient les mêmes personnes que le dépôt et
  // laisse une trace dans l'historique de la tâche.
  async remind(companyId: string, actor: Actor, projectId: string, taskId: string) {
    assertInCircuit(actor.role);
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        version: true,
        assigneId: true,
        projet: { select: { code: true, cellules: CHIEF_CELL } },
        evenements: {
          where: { type: { in: ['remise', 'relance'] } },
          orderBy: { creeLe: 'desc' },
          select: { type: true, creeLe: true },
        },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    if (!employeeId || employeeId !== task.assigneId)
      throw new ForbiddenException('Seule la personne assignée relance son validateur.');
    if (task.statut !== 'a_valider') throw new ConflictException('Cette tâche n’attend pas de validation.');
    const submission = task.evenements.find((e) => e.type === 'remise');
    const reminder = task.evenements.find((e) => e.type === 'relance');
    if (!submission) throw new ConflictException('Aucun dépôt à relancer.');
    const holidays = (await this.reglages.joursFeries([companyId])).get(companyId) ?? new Set<string>();
    const possibleOn = reminderPossibleOn(submission.creeLe, reminder?.creeLe ?? null, holidays);
    if (todayIso() < possibleOn) {
      throw new ConflictException(`Relance possible à partir du ${formatDate(possibleOn)}.`);
    }
    const days = workdaysAfter(toIsoDay(submission.creeLe), todayIso(), holidays);
    const vNN = versionLabel(task.version);
    await this.prisma.evenementTacheProjet.create({
      data: {
        tacheId: task.id,
        type: 'relance',
        parId: actor.userId,
        detail: `Relance du validateur · ${vNN} déposée il y a ${days} jours ouvrés`,
      },
    });
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    await this.circuit.notify(
      companyId,
      projectId,
      task.projet.code,
      'tache_remise',
      `Relance · ${vNN} à valider depuis ${days} jours ouvrés · ${task.projet.code} · ${task.libelle}`,
      actor.userId,
      await this.circuit.reviewers(ctx, employeeId, chiefOf(task.projet)),
    );
  }

  // Un fichier de remise (contenu inclus). Le contrôle d'accès au projet est
  // fait par l'appelant (périmètre Projets, ou assigné / valideur).
  async submissionFile(companyId: string, projectId: string, taskId: string, fileId: string) {
    const f = await this.prisma.pieceRemiseTache.findFirst({
      where: { id: fileId, tacheId: taskId, tache: { projetId: projectId, projet: { societeId: companyId } } },
      select: { nom: true, cle: true },
    });
    if (!f) throw new NotFoundException('Fichier introuvable');
    return { nom: f.nom, url: f.cle };
  }

  // Assigné de la tâche ou personne qui peut en décider (Mon espace).
  async checkFileAccess(companyId: string, actor: Actor, projectId: string, taskId: string) {
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId } },
      select: { assigneId: true, projet: { select: { cellules: CHIEF_CELL } } },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    if (employeeId && task.assigneId === employeeId) return;
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    const t = {
      assigneId: task.assigneId,
      assigneeIsDplg: !!task.assigneId && ctx.dplgEmployees.has(task.assigneId),
    };
    if (canQualify({ role: actor.role, employeeId, ctoStandsIn: ctx.ctoStandsIn }, t, chiefOf(task.projet))) return;
    throw new ForbiddenException('Fichier réservé à l’assigné et à son valideur.');
  }

  // Une tâche dont dépend la carte (« carte.tâche ») n'est pas encore faite.
  private async cardLocked(projectId: string, refs: string[]): Promise<boolean> {
    for (const ref of refs) {
      const [card, key] = ref.split('.');
      const t = await this.prisma.tacheProjet.findFirst({
        where: { projetId: projectId, cle: key, carte: { cle: card } },
        select: { statut: true, visaRequis: true, visaLe: true, visaNonTrace: true },
      });
      // Faite : non nécessaire, ou validée (et visée si le visa DPLG est exigé).
      if (
        t &&
        !(t.statut === 'non_necessaire' || (t.statut === 'validee' && (!t.visaRequis || t.visaLe || t.visaNonTrace)))
      )
        return true;
    }
    return false;
  }
}
