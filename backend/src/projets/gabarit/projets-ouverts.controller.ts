import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ProjetsOuvertsService } from './projets-ouverts.service';

type R = { user: { societeId: string } };

// Projets ouverts selon le gabarit (maquette « Projets » du boss).
@Controller('societes/:slug/projets-ouverts')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ProjetsOuvertsController {
  constructor(private projets: ProjetsOuvertsService) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  tableau(@Req() req: R) {
    return this.projets.tableau(req.user.societeId);
  }

  @Get(':id')
  @RequiertPermission('projets', 'lecture')
  dossier(@Req() req: R, @Param('id') id: string) {
    return this.projets.dossier(req.user.societeId, id);
  }
}
