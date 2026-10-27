import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import {
  AssignTaskDto,
  DecideExtensionDto,
  DecideTaskDto,
  PostCommentDto,
  RequestExtensionDto,
  SiteStatusDto,
  SiteVisitDateDto,
  SubmitTaskDto,
  TaskVisaDto,
} from './open-projects.dto';
import { ProductionService } from './production.service';
import { ProjectFileService } from './project-file.service';
import { ProjectSiteService } from './project-site.service';
import { ProjectThreadsService } from './project-threads.service';
import { ProjectsBoardService } from './projects-board.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskExtensionService } from './task-extension.service';
import { TaskReviewService } from './task-review.service';
import { TaskSubmissionService } from './task-submission.service';

type R = { user: { societeId: string; userId: string; role: string; permissions?: Record<string, NiveauPermission> } };

// Projets ouverts selon le gabarit (maquette « Projets » du boss).
@Controller('societes/:slug/projets-ouverts')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class OpenProjectsController {
  constructor(
    private boards: ProjectsBoardService,
    private projectFile: ProjectFileService,
    private productionService: ProductionService,
    private site: ProjectSiteService,
    private assignment: TaskAssignmentService,
    private submission: TaskSubmissionService,
    private review: TaskReviewService,
    private extension: TaskExtensionService,
    private threads: ProjectThreadsService,
  ) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  board(@Req() req: R) {
    return this.boards.board(req.user.societeId, req.user);
  }

  // Segment fixe, déclaré avant ':id'.
  @Get('assignables')
  @RequiertPermission('projets', 'ecriture')
  assignable(@Req() req: R) {
    return this.assignment.assignable(req.user.societeId);
  }

  @Get('mentionnables')
  @RequiertPermission('projets', 'lecture')
  mentionable(@Req() req: R) {
    return this.threads.mentionable(req.user.societeId);
  }

  // Tableau de production (Dir. GC : ses projets ; CTO, CEO : tous) — rôle
  // vérifié par le service.
  @Get('production')
  @RequiertPermission('projets', 'lecture')
  production(@Req() req: R) {
    return this.productionService.production(req.user.societeId, req.user);
  }

  // « À décider » : remises et prolongations que je peux trancher, tous projets.
  @Get('a-decider')
  @RequiertPermission('projets', 'lecture')
  toDecide(@Req() req: R) {
    return this.boards.toDecide(req.user.societeId, req.user);
  }

  // « Mes tâches » : mes @mentions, et les marquer traitées.
  @Get('mes-mentions')
  @RequiertPermission('projets', 'lecture')
  myMentions(@Req() req: R) {
    return this.threads.myMentions(req.user.societeId, req.user.userId);
  }

  @Post('mes-mentions/:commentaireId/lue')
  @RequiertPermission('projets', 'lecture')
  markMentionRead(@Req() req: R, @Param('commentaireId') commentId: string) {
    return this.threads.markMentionRead(req.user.societeId, req.user.userId, commentId);
  }

  @Get(':id')
  @RequiertPermission('projets', 'lecture')
  file(@Req() req: R, @Param('id') projectId: string) {
    return this.projectFile.file(req.user.societeId, projectId, req.user);
  }

  @Patch(':id/chantier')
  @RequiertPermission('projets', 'ecriture')
  setSiteStatus(@Req() req: R, @Param('id') projectId: string, @Body() dto: SiteStatusDto) {
    return this.site.setSiteStatus(req.user.societeId, projectId, dto.statut);
  }

  @Patch(':id/visite')
  @RequiertPermission('projets', 'ecriture')
  setSiteVisitDate(@Req() req: R, @Param('id') projectId: string, @Body() dto: SiteVisitDateDto) {
    return this.site.setSiteVisitDate(req.user.societeId, projectId, dto.date);
  }

  // Avant d'assigner : charge de chacun sur la fenêtre de la tâche.
  @Get(':id/taches/:tacheId/charges')
  @RequiertPermission('projets', 'ecriture')
  workload(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string) {
    return this.productionService.workload(req.user.societeId, projectId, taskId);
  }

  @Get(':id/taches/:tacheId/historique')
  @RequiertPermission('projets', 'lecture')
  async history(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string) {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.assignment.history(req.user.societeId, projectId, taskId);
  }

  // « Lecture et assignation » : l'écriture sur Projets suffit.
  @Patch(':id/taches/:tacheId/assignation')
  @RequiertPermission('projets', 'ecriture')
  assign(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string, @Body() dto: AssignTaskDto) {
    return this.assignment.assign(req.user.societeId, req.user, projectId, taskId, dto.collaborateurId, !!dto.carte);
  }

  // Remise par la personne assignée (vérifié par le service) — le Salarié n'a
  // que la lecture sur Projets.
  @Post(':id/taches/:tacheId/remise')
  @RequiertPermission('projets', 'lecture')
  submit(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string, @Body() dto: SubmitTaskDto) {
    return this.submission.submit(req.user.societeId, req.user, projectId, taskId, dto);
  }

  // Fichier d'une remise : quiconque voit le projet (même règle que l'historique).
  @Get(':id/taches/:tacheId/pieces/:pieceId')
  @RequiertPermission('projets', 'lecture')
  async submissionFile(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Param('pieceId') fileId: string,
  ) {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.submission.submissionFile(req.user.societeId, projectId, taskId, fileId);
  }

  // Prolongation : demande de l'assigné, décision du chef de team ou du DPLG
  // (droits vérifiés par le service).
  @Post(':id/taches/:tacheId/prolongation')
  @RequiertPermission('projets', 'lecture')
  requestExtension(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: RequestExtensionDto,
  ) {
    return this.extension.request(req.user.societeId, req.user, projectId, taskId, dto.jusquau, dto.motif);
  }

  @Post(':id/taches/:tacheId/prolongation/decision')
  @RequiertPermission('projets', 'lecture')
  decideExtension(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: DecideExtensionDto,
  ) {
    return this.extension.decide(req.user.societeId, req.user, projectId, taskId, dto.accorder);
  }

  // Remise : valider ou renvoyer en reprise (droits vérifiés par le service).
  // Lecture suffit : le chef de team peut être Salarié ; le service vérifie
  // qu'il s'agit du chef de team du projet ou de l'Architecte DPLG.
  @Post(':id/taches/:tacheId/decision')
  @RequiertPermission('projets', 'lecture')
  decide(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string, @Body() dto: DecideTaskDto) {
    return this.review.decide(req.user.societeId, req.user, projectId, taskId, dto.decision, dto.motif);
  }

  // Visa DPLG d'une tâche validée (droits vérifiés par le service).
  @Post(':id/taches/:tacheId/visa')
  @RequiertPermission('projets', 'lecture')
  visa(@Req() req: R, @Param('id') projectId: string, @Param('tacheId') taskId: string, @Body() dto: TaskVisaDto) {
    return this.review.visa(req.user.societeId, req.user, projectId, taskId, dto.apposer, dto.motif);
  }

  // Fil d'une carte (?carte=) ou d'une tâche (?tache=).
  @Get(':id/fil')
  @RequiertPermission('projets', 'lecture')
  async thread(
    @Req() req: R,
    @Param('id') projectId: string,
    @Query('carte') carteId?: string,
    @Query('tache') tacheId?: string,
  ) {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.threads.read(req.user.societeId, projectId, { carteId, tacheId });
  }

  // Écriture sur Projets, ou Salarié sur un de ses projets (cf. checkWrite).
  @Post(':id/fil')
  @RequiertPermission('projets', 'lecture')
  async postComment(@Req() req: R, @Param('id') projectId: string, @Body() dto: PostCommentDto) {
    await this.threads.checkWrite(req.user.societeId, req.user, projectId);
    return this.threads.post(req.user.societeId, req.user, projectId, dto);
  }

  @Post(':id/fil/:commentaireId/resolution')
  @RequiertPermission('projets', 'lecture')
  async resolveComment(@Req() req: R, @Param('id') projectId: string, @Param('commentaireId') commentId: string) {
    await this.threads.checkWrite(req.user.societeId, req.user, projectId);
    return this.threads.resolve(req.user.societeId, req.user, projectId, commentId);
  }
}
