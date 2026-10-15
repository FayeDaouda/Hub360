import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { RolesService } from './roles.service';
import { MajPermissionDto } from './dto';

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
