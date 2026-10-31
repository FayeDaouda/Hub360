import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HubAdminGuard } from '../commun/hub-admin.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { AdministrationService } from './administration.service';
import { RolesService } from './roles.service';
import { EnregistrerDroitsDto } from './roles.dto';

type R = { user: { societeId: string; userId: string } };

// Matrice des droits d'une société (31/10/2026) : visible et modifiable par
// le CIO et l'Administrateur HUB seuls, connectés sur cette société.
@Controller('societes/:slug/roles')
@UseGuards(JwtAuthGuard, HubAdminGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get()
  lister(@Req() req: R) {
    return this.roles.matrice(req.user.societeId);
  }

  // Rend la matrice enregistrée (règle de cohérence appliquée par le serveur).
  @Put('droits')
  enregistrer(@Req() req: R, @Body() dto: EnregistrerDroitsDto) {
    return this.roles.enregistrer(req.user.societeId, dto.changements, req.user.userId);
  }
}

// « À traiter aujourd'hui » de l'administration (revue CIO, 22/10/2026).
@Controller('societes/:slug/administration')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class AdministrationController {
  constructor(private administration: AdministrationService) {}

  @Get('a-traiter')
  aTraiter(@Req() req: R) {
    return this.administration.aTraiter(req.user.societeId);
  }
}
