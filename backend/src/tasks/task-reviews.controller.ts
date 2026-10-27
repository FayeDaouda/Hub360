import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { GroupScope } from '../tenancy/tenant-scope.decorators';
import { SubmissionFileDto, TaskToReviewDto } from './task-review.dto';
import { TaskDecisionDto } from './tasks.dto';
import { TasksService } from './tasks.service';

type R = { user: { userId: string; societeId: string; role: string } };

// Le valideur (chef de team, Architecte DPLG, admin) : le service vérifie
// qu'il l'est bien pour chaque tâche.
@GroupScope()
@Controller('societes/:slug/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class TaskReviewsController {
  constructor(private tasks: TasksService) {}

  @Get('a-valider')
  toReview(@Req() req: R): Promise<TaskToReviewDto[]> {
    return this.tasks.toReview(req.user);
  }

  // Fichier d'une remise : l'assigné ou son valideur (vérifié par le service).
  @Get(':projetId/:tacheId/pieces/:pieceId')
  submissionFile(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projectId: string,
    @Param('tacheId', ParseUUIDPipe) taskId: string,
    @Param('pieceId', ParseUUIDPipe) fileId: string,
  ): Promise<SubmissionFileDto> {
    return this.tasks.submissionFile(req.user, projectId, taskId, fileId);
  }

  @Post(':projetId/:tacheId/decision')
  decide(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projectId: string,
    @Param('tacheId', ParseUUIDPipe) taskId: string,
    @Body() dto: TaskDecisionDto,
  ): Promise<TaskToReviewDto[]> {
    return this.tasks.decide(req.user, projectId, taskId, dto);
  }
}
