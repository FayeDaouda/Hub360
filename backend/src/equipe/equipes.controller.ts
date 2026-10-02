import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { EquipesService } from './equipes.service';

type R = { user: { societeId: string } };

// Page « Équipes » (maquette du boss, oct. 2026) — lecture ; les écritures
// passent par CellulesController et CollaborateursController (module équipe).
@Controller('societes/:slug/equipes')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class EquipesController {
  constructor(private equipes: EquipesService) {}

  @Get()
  @RequiertPermission('equipe', 'lecture')
  vue(@Req() req: R) {
    return this.equipes.vue(req.user.societeId);
  }
}
