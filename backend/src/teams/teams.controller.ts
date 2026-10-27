import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { TeamsService } from './teams.service';
import { TeamsViewDto } from './teams-view.dto';

type R = { user: { societeId: string } };

// Page « Équipes » (maquette du boss, oct. 2026) — lecture ; les écritures
// passent par CellsController et EmployeesController (module équipe).
@Controller('societes/:slug/equipes')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class TeamsController {
  constructor(private teams: TeamsService) {}

  @Get()
  @RequiertPermission('equipe', 'lecture')
  view(@Req() req: R): Promise<TeamsViewDto> {
    return this.teams.view(req.user.societeId);
  }
}
