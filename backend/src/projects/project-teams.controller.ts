import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { ProjectTeamsService } from './project-teams.service';
import { ProjectTeamsDto, SetProjectTeamsDto } from './project-teams.dto';

type R = { user: { societeId: string } };

// Équipes d'un projet, ouvert ou non (dès l'Onboard). Affecter, c'est
// organiser les équipes : écriture sur le module « équipe » (le Dir. GC,
// l'administration) ; la lecture suit le module « projets ».
@Controller('societes/:slug/projets/:id/equipes')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ProjectTeamsController {
  constructor(private teams: ProjectTeamsService) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  get(@Req() req: R, @Param('id') projectId: string): Promise<ProjectTeamsDto> {
    return this.teams.teams(req.user.societeId, projectId);
  }

  @Put()
  @RequiertPermission('equipe', 'ecriture')
  set(@Req() req: R, @Param('id') projectId: string, @Body() dto: SetProjectTeamsDto): Promise<ProjectTeamsDto> {
    return this.teams.setTeams(req.user.societeId, projectId, dto.celluleIds);
  }
}
