import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { DecisionSalaireDto } from './dto';
import { SalairesService } from './salaires.service';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

type R = { user: { userId: string } };

// Validation des changements de salaire (revue RH validée 20/10/2026) : le
// CFO (le CEO pour le salaire du CFO) — module « rh » en lecture, le droit de
// décider est vérifié par le service, par titulaire du rôle.
@GroupScope()
@Controller('societes/:slug/rh/salaires')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
@RequiertPermission('rh', 'lecture')
export class SalairesController {
  constructor(private salaires: SalairesService) {}

  @Get('a-valider')
  aValider(@Req() req: R) {
    return this.salaires.aValider(req.user.userId);
  }

  @Get(':id')
  detail(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.salaires.detail(id, req.user.userId);
  }

  @Post(':id/decision')
  decider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionSalaireDto) {
    return this.salaires.decider(id, req.user.userId, dto.valide, dto.motifRefus);
  }
}
