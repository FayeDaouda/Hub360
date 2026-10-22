import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { AdministrationService } from './administration.service';
import { RolesService } from './roles.service';
import { DecisionDroitDto, MajPermissionDto } from './dto';

type R = { user: { societeId: string; role: string; userId: string } };

// Matrice des rôles d'une société — son admin, ou le CIO (super admin du
// HUB) connecté sur cette société. Qui modifie quelle ligne : RolesService.
@Controller('societes/:slug/roles')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get()
  lister(@Req() req: R) {
    return this.roles.listerAvecPermissions(req.user.societeId, req.user.role);
  }

  @Patch(':roleId/modules/:moduleCle')
  majPermission(
    @Req() req: R,
    @Param('roleId') roleId: string,
    @Param('moduleCle') moduleCle: string,
    @Body() dto: MajPermissionDto,
  ) {
    return this.roles.majPermission(req.user.societeId, roleId, moduleCle, dto.niveau, req.user.role, req.user.userId);
  }
}

// Droits du rôle CIO (revue CIO, 22/10/2026) : demandes en attente, que le
// CEO accepte ou refuse — hors de la matrice, le CEO n'y a pas la main.
@Controller('societes/:slug/droits/demandes')
@UseGuards(JwtAuthGuard, BackOfficeGuard)
export class DemandesDroitController {
  constructor(private roles: RolesService) {}

  @Get()
  lister(@Req() req: R) {
    return this.roles.demandes(req.user.societeId, req.user.role);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decider(@Req() req: R, @Param('id') id: string, @Body() dto: DecisionDroitDto) {
    return this.roles.decider(req.user.societeId, req.user.role, req.user.userId, id, dto.accepter, dto.motif);
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
