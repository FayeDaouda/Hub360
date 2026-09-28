import { Body, Controller, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { ProjetsService } from './projets.service';
import { ChangerPhaseDto } from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/projets/:id/phase')
@PermissionSelonMethode('projets', { roleHorsMatrice: 'collaborateur' })
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class PhaseController {
  constructor(private projets: ProjetsService) {}

  @Put()
  changer(@Req() req: R, @Param('id') id: string, @Body() dto: ChangerPhaseDto) {
    return this.projets.changerPhase(
      req.user.societeId,
      id,
      dto.phase,
      req.user.userId,
    );
  }
}
