import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExtraModels } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import {
  AssignCardDto,
  AssignTaskDto,
  CustomLineDto,
  DecideExtensionDto,
  DecideTaskDto,
  PostCommentDto,
  RequestExtensionDto,
  SiteStatusDto,
  SiteVisitDateDto,
  SubmitTaskDto,
  TaskVisaDto,
  UpdateLineDto,
} from './open-projects.dto';
import { OpenProjectFileDto } from './open-project-file.dto';
import {
  AssignableEmployeeDto,
  AssignmentResultDto,
  CommentRefDto,
  ConversationProjetDto,
  CustomizationResultDto,
  ExtensionDecisionResultDto,
  ExtensionRequestResultDto,
  MentionablePersonDto,
  MyMentionDto,
  OpenProjectsBoardDto,
  ResolutionDto,
  ReviewDecisionResultDto,
  SiteStatusResultDto,
  SiteVisitDateResultDto,
  SubmissionFileDto,
  SubmissionResultDto,
  TaskEventDto,
  TaskWorkloadDto,
  ThreadRootDto,
  ToDecideDto,
  VisaResultDto,
} from './open-projects-view.dto';
import { ProductionViewDto } from './production-view.dto';
import { ChatService } from '../chat/chat.service';
import { ProductionService } from './production.service';
import { ProjectCustomizationService } from './project-customization.service';
import { ProjectFileService } from './project-file.service';
import { ProjectSiteService } from './project-site.service';
import { PROJECT_STATE_MODELS } from './project-state.dto';
import { ProjectThreadsService } from './project-threads.service';
import { ProjectsBoardService } from './projects-board.service';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskExtensionService } from './task-extension.service';
import { TaskReviewService } from './task-review.service';
import { TaskSubmissionService } from './task-submission.service';

type R = { user: { societeId: string; userId: string; role: string; permissions?: Record<string, string> } };

// Projets ouverts selon le gabarit (maquette « Projets » du boss).
@ApiExtraModels(...PROJECT_STATE_MODELS)
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
    private customization: ProjectCustomizationService,
    private chat: ChatService,
  ) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  board(@Req() req: R): Promise<OpenProjectsBoardDto> {
    return this.boards.board(req.user.societeId, req.user);
  }

  @Get('mentionnables')
  @RequiertPermission('projets', 'lecture')
  mentionable(@Req() req: R): Promise<MentionablePersonDto[]> {
    return this.threads.mentionable(req.user.societeId);
  }

  // Tableau de production (Dir. GC : ses projets ; les autres : tous) — la
  // Lecture de son étape est vérifiée par le service.
  @Get('production')
  @RequiertPermission('projets', 'lecture')
  production(@Req() req: R): Promise<ProductionViewDto> {
    return this.productionService.production(req.user.societeId, req.user);
  }

  // « À décider » : remises et prolongations que je peux trancher, tous projets.
  @Get('a-decider')
  @RequiertPermission('projets', 'lecture')
  toDecide(@Req() req: R): Promise<ToDecideDto> {
    return this.boards.toDecide(req.user.societeId, req.user);
  }

  // « Mes tâches » : mes @mentions, et les marquer traitées.
  @Get('mes-mentions')
  @RequiertPermission('projets', 'lecture')
  myMentions(@Req() req: R): Promise<MyMentionDto[]> {
    return this.threads.myMentions(req.user.societeId, req.user.userId);
  }

  @Post('mes-mentions/:commentaireId/lue')
  @RequiertPermission('projets', 'lecture')
  markMentionRead(@Req() req: R, @Param('commentaireId') commentId: string): Promise<CommentRefDto> {
    return this.threads.markMentionRead(req.user.societeId, req.user.userId, commentId);
  }

  @Get(':id')
  @RequiertPermission('projets', 'lecture')
  file(@Req() req: R, @Param('id') projectId: string): Promise<OpenProjectFileDto> {
    return this.projectFile.file(req.user.societeId, projectId, req.user);
  }

  @Patch(':id/chantier')
  @RequiertPermission('projets', 'ecriture')
  setSiteStatus(
    @Req() req: R,
    @Param('id') projectId: string,
    @Body() dto: SiteStatusDto,
  ): Promise<SiteStatusResultDto> {
    return this.site.setSiteStatus(req.user.societeId, projectId, dto.statut);
  }

  @Patch(':id/visite')
  @RequiertPermission('projets', 'ecriture')
  setSiteVisitDate(
    @Req() req: R,
    @Param('id') projectId: string,
    @Body() dto: SiteVisitDateDto,
  ): Promise<SiteVisitDateResultDto> {
    return this.site.setSiteVisitDate(req.user.societeId, projectId, dto.date);
  }

  // Personnes proposées dans « Assigner » : tout le monde pour le Dir. GC,
  // les membres de ses équipes pour un chef d'équipe (vérifié par le service).
  @Get(':id/assignables')
  @RequiertPermission('projets', 'lecture')
  assignable(@Req() req: R, @Param('id') projectId: string): Promise<AssignableEmployeeDto[]> {
    return this.assignment.assignable(req.user.societeId, req.user, projectId);
  }

  // Avant d'assigner : charge de chacun sur la fenêtre de la tâche — limitée
  // aux membres de ses équipes pour un chef d'équipe.
  @Get(':id/taches/:tacheId/charges')
  @RequiertPermission('projets', 'lecture')
  async workload(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
  ): Promise<TaskWorkloadDto> {
    const scope = await this.assignment.scopeOrThrow(req.user.societeId, req.user, projectId);
    return this.productionService.workload(
      req.user.societeId,
      projectId,
      taskId,
      scope === 'all' ? null : scope.cellIds,
    );
  }

  @Get(':id/taches/:tacheId/historique')
  @RequiertPermission('projets', 'lecture')
  async history(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
  ): Promise<TaskEventDto[]> {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.assignment.history(req.user.societeId, projectId, taskId);
  }

  // Le bloc entier (bouton de l'en-tête de la carte) : ses tâches encore
  // ouvertes. Mêmes droits que la tâche (vérifiés par le service).
  @Patch(':id/cartes/:carteId/assignation')
  @RequiertPermission('projets', 'lecture')
  assignCard(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('carteId') cardId: string,
    @Body() dto: AssignCardDto,
  ): Promise<AssignmentResultDto> {
    return this.assignment.assignCard(req.user.societeId, req.user, projectId, cardId, dto.collaborateurId);
  }

  // Charge de chacun sur la fenêtre du bloc, avant de l'assigner.
  @Get(':id/cartes/:carteId/charges')
  @RequiertPermission('projets', 'lecture')
  async cardWorkload(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('carteId') cardId: string,
  ): Promise<TaskWorkloadDto> {
    const scope = await this.assignment.scopeOrThrow(req.user.societeId, req.user, projectId);
    return this.productionService.cardWorkload(
      req.user.societeId,
      projectId,
      cardId,
      scope === 'all' ? null : scope.cellIds,
    );
  }

  // Le Dir. GC (écriture sur Projets) ou un chef d'équipe du projet (vérifié
  // par le service).
  @Patch(':id/taches/:tacheId/assignation')
  @RequiertPermission('projets', 'lecture')
  assign(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: AssignTaskDto,
  ): Promise<AssignmentResultDto> {
    return this.assignment.assign(req.user.societeId, req.user, projectId, taskId, dto.collaborateurId, !!dto.carte);
  }

  // Remise par la personne assignée (vérifié par le service) — le Salarié n'a
  // que la lecture sur Projets.
  @Post(':id/taches/:tacheId/remise')
  @RequiertPermission('projets', 'lecture')
  submit(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: SubmitTaskDto,
  ): Promise<SubmissionResultDto> {
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
  ): Promise<SubmissionFileDto> {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.submission.submissionFile(req.user.societeId, projectId, taskId, fileId);
  }

  // Prolongation : demande de l'assigné, décision du chef d’équipe ou du DPLG
  // (droits vérifiés par le service).
  @Post(':id/taches/:tacheId/prolongation')
  @RequiertPermission('projets', 'lecture')
  requestExtension(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: RequestExtensionDto,
  ): Promise<ExtensionRequestResultDto> {
    return this.extension.request(req.user.societeId, req.user, projectId, taskId, dto.jusquau, dto.motif);
  }

  @Post(':id/taches/:tacheId/prolongation/decision')
  @RequiertPermission('projets', 'lecture')
  decideExtension(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: DecideExtensionDto,
  ): Promise<ExtensionDecisionResultDto> {
    return this.extension.decide(req.user.societeId, req.user, projectId, taskId, dto.accorder);
  }

  // Remise : valider ou renvoyer en reprise (droits vérifiés par le service).
  // Lecture suffit : le chef d’équipe peut être Salarié ; le service vérifie
  // qu'il s'agit du chef d’équipe du projet ou de l'Architecte DPLG.
  @Post(':id/taches/:tacheId/decision')
  @RequiertPermission('projets', 'lecture')
  decide(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: DecideTaskDto,
  ): Promise<ReviewDecisionResultDto> {
    return this.review.decide(req.user.societeId, req.user, projectId, taskId, dto.decision, dto.motif);
  }

  // Discussion du projet (02/11/2026) : sa conversation, tenue à jour
  // automatiquement (équipes, assignés, direction), ouverte pour ses membres.
  @Post(':id/conversation')
  @RequiertPermission('projets', 'lecture')
  conversation(@Req() req: R, @Param('id') projectId: string): Promise<ConversationProjetDto> {
    return this.chat.ouvrirCanalProjet(req.user, projectId);
  }

  // Personnalisation d'un projet (01/11/2026) : ligne ajoutée en fin de
  // carte, modifiée ou retirée (droit vérifié par le service).
  @Post(':id/cartes/:carteId/lignes')
  @RequiertPermission('projets', 'lecture')
  addLine(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('carteId') cardId: string,
    @Body() dto: CustomLineDto,
  ): Promise<CustomizationResultDto> {
    return this.customization.addLine(req.user.societeId, req.user, projectId, cardId, dto);
  }

  @Patch(':id/taches/:tacheId/ligne')
  @RequiertPermission('projets', 'lecture')
  updateLine(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: UpdateLineDto,
  ): Promise<CustomizationResultDto> {
    return this.customization.updateLine(req.user.societeId, req.user, projectId, taskId, dto);
  }

  @Delete(':id/taches/:tacheId/ligne')
  @RequiertPermission('projets', 'lecture')
  removeLine(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
  ): Promise<CustomizationResultDto> {
    return this.customization.removeLine(req.user.societeId, req.user, projectId, taskId);
  }

  // Visa DPLG d'une tâche validée (droits vérifiés par le service).
  @Post(':id/taches/:tacheId/visa')
  @RequiertPermission('projets', 'lecture')
  visa(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('tacheId') taskId: string,
    @Body() dto: TaskVisaDto,
  ): Promise<VisaResultDto> {
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
  ): Promise<ThreadRootDto[]> {
    await this.threads.checkRead(req.user.societeId, req.user, projectId);
    return this.threads.read(req.user.societeId, projectId, { carteId, tacheId });
  }

  // Écriture sur Projets, ou Salarié sur un de ses projets (cf. checkWrite).
  @Post(':id/fil')
  @RequiertPermission('projets', 'lecture')
  async postComment(
    @Req() req: R,
    @Param('id') projectId: string,
    @Body() dto: PostCommentDto,
  ): Promise<CommentRefDto> {
    await this.threads.checkWrite(req.user.societeId, req.user, projectId);
    return this.threads.post(req.user.societeId, req.user, projectId, dto);
  }

  @Post(':id/fil/:commentaireId/resolution')
  @RequiertPermission('projets', 'lecture')
  async resolveComment(
    @Req() req: R,
    @Param('id') projectId: string,
    @Param('commentaireId') commentId: string,
  ): Promise<ResolutionDto> {
    await this.threads.checkWrite(req.user.societeId, req.user, projectId);
    return this.threads.resolve(req.user.societeId, req.user, projectId, commentId);
  }
}
