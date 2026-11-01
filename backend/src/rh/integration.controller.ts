import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode, RequiertPermission } from '../commun/permission.decorator';
import { IntegrationService } from './integration.service';
import { GroupScope } from '../tenancy/tenant-scope.decorators';
import { PointIntegrationDto } from './integration.dto';
import { ETAPE } from '@hub/domain';

type R = { user: { userId: string } };

// RH · Intégration (lot 3). Module « rh » : lecture CFO/CEO, écriture RH.
@GroupScope()
@Controller('societes/:slug/rh/integrations')
@PermissionSelonMethode('rh')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class IntegrationController {
  constructor(private integration: IntegrationService) {}

  @Get()
  lister() {
    return this.integration.liste();
  }

  @Post(':dossierId/points/:jalon')
  @RequiertPermission(ETAPE.rhIntegration, 'ecriture')
  point(
    @Req() req: R,
    @Param('dossierId', ParseUUIDPipe) dossierId: string,
    @Param('jalon', ParseIntPipe) jalon: number,
    @Body() dto: PointIntegrationDto,
  ) {
    return this.integration.enregistrerPoint(req.user, dossierId, jalon, dto);
  }

  @Post(':dossierId/confirmation')
  @RequiertPermission(ETAPE.rhIntegration, 'ecriture')
  confirmer(@Req() req: R, @Param('dossierId', ParseUUIDPipe) dossierId: string) {
    return this.integration.confirmer(req.user, dossierId);
  }
}
