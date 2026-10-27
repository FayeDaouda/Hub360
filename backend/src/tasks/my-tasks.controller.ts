import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { SubmitTaskDto } from '../projects/open-projects.dto';
import { GroupScope } from '../tenancy/tenant-scope.decorators';
import { MyTasksViewDto } from './my-tasks-view.dto';
import { TasksService } from './tasks.service';

type R = { user: { userId: string; societeId: string; role: string } };

// L'assigné : ses tâches (Mes tâches, Mes performances) et leur remise.
@GroupScope()
@Controller('societes/:slug/mon-espace/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MyTasksController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Req() req: R): Promise<MyTasksViewDto> {
    return this.tasks.myTasks(req.user);
  }

  // Tâche du gabarit : le service vérifie que la personne connectée en est l'assignée.
  @Post(':projetId/:tacheId/remise')
  submit(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projectId: string,
    @Param('tacheId', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitTaskDto,
  ): Promise<MyTasksViewDto> {
    return this.tasks.submit(req.user, projectId, taskId, dto);
  }

  // Relancer son validateur : 3 jours ouvrés après le dépôt (puis après la
  // relance précédente) — le service vérifie l'assigné et le délai.
  @Post(':projetId/:tacheId/relance')
  remind(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projectId: string,
    @Param('tacheId', ParseUUIDPipe) taskId: string,
  ): Promise<MyTasksViewDto> {
    return this.tasks.remind(req.user, projectId, taskId);
  }
}
