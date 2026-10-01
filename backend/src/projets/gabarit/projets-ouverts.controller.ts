import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ProjetsOuvertsService } from './projets-ouverts.service';
import { TachesProjetService } from './taches-projet.service';
import { AssignerTacheDto } from './dto';

type R = { user: { societeId: string; userId: string } };

// Projets ouverts selon le gabarit (maquette « Projets » du boss).
@Controller('societes/:slug/projets-ouverts')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ProjetsOuvertsController {
  constructor(
    private projets: ProjetsOuvertsService,
    private taches: TachesProjetService,
  ) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  tableau(@Req() req: R) {
    return this.projets.tableau(req.user.societeId);
  }

  // Segment fixe, déclaré avant ':id'.
  @Get('assignables')
  @RequiertPermission('projets', 'ecriture')
  assignables(@Req() req: R) {
    return this.taches.assignables(req.user.societeId);
  }

  @Get(':id')
  @RequiertPermission('projets', 'lecture')
  dossier(@Req() req: R, @Param('id') id: string) {
    return this.projets.dossier(req.user.societeId, id);
  }

  @Get(':id/taches/:tacheId/historique')
  @RequiertPermission('projets', 'lecture')
  historique(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string) {
    return this.taches.historique(req.user.societeId, id, tacheId);
  }

  // « Lecture et assignation » : l'écriture sur Projets suffit.
  @Patch(':id/taches/:tacheId/assignation')
  @RequiertPermission('projets', 'ecriture')
  assigner(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: AssignerTacheDto) {
    return this.taches.assigner(req.user.societeId, req.user, id, tacheId, dto.collaborateurId, !!dto.carte);
  }
}
