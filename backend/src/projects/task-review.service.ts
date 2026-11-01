import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { todayIso } from '@hub/domain';
import { PrismaService } from '../prisma/prisma.service';
import { decisionContext } from './decision-context';
import { canDecide, canVisa, employeeOfAccount } from './review-rules';
import { CHIEF_CELL, chiefOf, versionLabel, type Actor } from './project-query';
import type { ReviewDecisionResultDto, VisaResultDto } from './open-projects-view.dto';
import { ReviewCircuitService } from './review-circuit.service';

// Décision sur une remise (valider ou renvoyer en reprise) et visa DPLG
// (maquette « Projets » ; revue Dir. GC, 21/10/2026).
@Injectable()
export class TaskReviewService {
  constructor(
    private prisma: PrismaService,
    private circuit: ReviewCircuitService,
  ) {}

  // Valider une remise, ou la renvoyer en reprise (motif) — chef d’équipe,
  // Architecte DPLG (tâches du chef, suppléance) ; jamais sa propre tâche.
  async decide(
    companyId: string,
    actor: Actor,
    projectId: string,
    taskId: string,
    decision: 'valider' | 'renvoyer',
    reason?: string,
  ): Promise<ReviewDecisionResultDto> {
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        statut: true,
        version: true,
        libelle: true,
        assigneId: true,
        visaRequis: true,
        projet: { select: { code: true, cellules: CHIEF_CELL } },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    if (task.statut !== 'a_valider') throw new ConflictException('Aucune remise en attente sur cette tâche.');
    const employeeId = await employeeOfAccount(this.prisma, companyId, actor.userId);
    const ctx = await decisionContext(this.prisma, companyId, todayIso());
    const assigneeIsDplg = !!task.assigneId && ctx.dplgEmployees.has(task.assigneId);
    if (
      !canDecide(
        { role: actor.role, employeeId, ctoStandsIn: ctx.ctoStandsIn, permissions: actor.permissions },
        { ...task, assigneeIsDplg },
        chiefOf(task.projet),
      )
    ) {
      throw new ForbiddenException(
        employeeId && employeeId === task.assigneId
          ? 'On ne valide jamais sa propre tâche.'
          : assigneeIsDplg
            ? 'Le travail du Dir. GC est validé par le CTO.'
            : 'La remise se valide par le chef d’équipe ou l’Architecte DPLG.',
      );
    }
    const vNN = versionLabel(task.version);
    await this.prisma.$transaction(async (tx) => {
      // Garde en base : la remise n'a pas été tranchée entre-temps.
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: task.id, statut: 'a_valider' },
        data:
          decision === 'valider'
            ? { statut: 'validee', valideeLe: new Date(), valideeParId: actor.userId }
            : { statut: 'reprise' },
      });
      if (!count) throw new ConflictException('La remise a déjà été tranchée.');
      await tx.evenementTacheProjet.create({
        data:
          decision === 'valider'
            ? { tacheId: task.id, type: 'validation', parId: actor.userId, detail: `Remise ${vNN} validée` }
            : {
                tacheId: task.id,
                type: 'reprise',
                parId: actor.userId,
                detail: `Remise ${vNN} renvoyée en reprise : ${reason!.trim()}`,
              },
      });
    });
    if (task.assigneId) {
      await this.circuit.notify(
        companyId,
        projectId,
        task.projet.code,
        decision === 'valider' ? 'tache_validee' : 'tache_renvoyee',
        decision === 'valider'
          ? `Remise ${vNN} validée · ${task.projet.code} · ${task.libelle}`
          : `Remise ${vNN} renvoyée en reprise · ${task.projet.code} · ${task.libelle}`,
        actor.userId,
        await this.circuit.accountsOf([task.assigneId]),
      );
    }
    // Validée, elle attend le visa de l'architecte DPLG : il est prévenu.
    if (decision === 'valider' && task.visaRequis) {
      const { comptes, enAttente } = await this.circuit.visaHolders(companyId);
      await this.circuit.notify(
        companyId,
        projectId,
        task.projet.code,
        'visa_a_apposer',
        enAttente
          ? `Visa DPLG en attente du retour du Dir. GC · ${task.projet.code} · ${task.libelle}`
          : `Visa DPLG à apposer · ${task.projet.code} · ${task.libelle}`,
        actor.userId,
        comptes,
      );
    }
    return { statut: decision === 'valider' ? 'validee' : 'reprise' };
  }

  // Visa DPLG (revue Dir. GC, 21/10/2026) : sur une tâche validée qui l'exige,
  // l'architecte DPLG appose son visa (daté, tracé) ou le refuse avec un
  // motif — la tâche repart alors en reprise chez la personne assignée.
  async visa(
    companyId: string,
    actor: Actor,
    projectId: string,
    taskId: string,
    affix: boolean,
    reason?: string,
  ): Promise<VisaResultDto> {
    if (!canVisa(actor))
      throw new ForbiddenException('Le visa DPLG engage la signature de l’architecte : le Dir. GC seul l’appose.');
    const task = await this.prisma.tacheProjet.findFirst({
      where: { id: taskId, projetId: projectId, projet: { societeId: companyId, ouvertLe: { not: null } } },
      select: {
        id: true,
        libelle: true,
        statut: true,
        version: true,
        visaRequis: true,
        visaLe: true,
        visaNonTrace: true,
        assigneId: true,
        projet: { select: { code: true } },
      },
    });
    if (!task) throw new NotFoundException('Tâche introuvable');
    if (!task.visaRequis) throw new ConflictException('Cette tâche n’exige pas de visa DPLG.');
    if (task.statut !== 'validee' || task.visaLe || task.visaNonTrace)
      throw new ConflictException('Aucun visa en attente sur cette tâche.');
    if (!affix && !reason?.trim()) throw new BadRequestException('Le motif du refus de visa est obligatoire.');
    const vNN = versionLabel(task.version);
    await this.prisma.$transaction(async (tx) => {
      // Garde en base : le visa n'a pas été tranché entre-temps.
      const { count } = await tx.tacheProjet.updateMany({
        where: { id: task.id, statut: 'validee', visaLe: null },
        data: affix
          ? { visaLe: new Date(), visaParId: actor.userId }
          : { statut: 'reprise', valideeLe: null, valideeParId: null },
      });
      if (!count) throw new ConflictException('Le visa a déjà été tranché.');
      await tx.evenementTacheProjet.create({
        data: {
          tacheId: task.id,
          type: 'visa',
          parId: actor.userId,
          detail: affix
            ? `Visa DPLG apposé sur la remise ${vNN}`
            : `Visa DPLG refusé, remise ${vNN} renvoyée en reprise : ${reason!.trim()}`,
        },
      });
    });
    if (task.assigneId) {
      await this.circuit.notify(
        companyId,
        projectId,
        task.projet.code,
        affix ? 'tache_validee' : 'tache_renvoyee',
        affix
          ? `Visa DPLG apposé · ${task.projet.code} · ${task.libelle}`
          : `Visa DPLG refusé, reprise · ${task.projet.code} · ${task.libelle}`,
        actor.userId,
        await this.circuit.accountsOf([task.assigneId]),
      );
    }
    return { visa: affix ? 'appose' : 'refuse' };
  }
}
