import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAccesGuard } from '../commun/societe-acces.guard';
import { RolesService } from './roles.service';
import { MajPermissionDto } from './dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/roles')
@UseGuards(JwtAuthGuard, SocieteAccesGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get()
  lister(@Req() req: R) {
    return this.roles.listerAvecPermissions(req.user.societeId);
  }

  @Patch(':roleId/modules/:moduleCle')
  majPermission(
    @Req() req: R,
    @Param('roleId') roleId: string,
    @Param('moduleCle') moduleCle: string,
    @Body() dto: MajPermissionDto,
  ) {
    return this.roles.majPermission(req.user.societeId, roleId, moduleCle, dto.niveau);
  }
}
