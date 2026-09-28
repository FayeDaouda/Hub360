import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HoldingAdminGuard } from '../commun/holding-admin.guard';
import { ComptesGroupeService } from './comptes-groupe.service';
import { ChangerRoleDto, DefinirSalaireDto } from './dto';

type R = { user: { userId: string } };

// Écran « Comptes & rôles » de l'espace groupe — admin du groupe uniquement.
@Controller('groupe/comptes')
@UseGuards(JwtAuthGuard, HoldingAdminGuard)
export class ComptesGroupeController {
  constructor(private comptes: ComptesGroupeService) {}

  @Get()
  lister() {
    return this.comptes.lister();
  }

  @Put(':utilisateurId/societes/:societeId/role')
  changerRole(
    @Req() req: R,
    @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string,
    @Param('societeId', ParseUUIDPipe) societeId: string,
    @Body() dto: ChangerRoleDto,
  ) {
    return this.comptes.changerRole(utilisateurId, societeId, dto.roleId, req.user.userId);
  }

  @Put(':utilisateurId/salaire')
  definirSalaire(
    @Req() req: R,
    @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string,
    @Body() dto: DefinirSalaireDto,
  ) {
    return this.comptes.definirSalaire(utilisateurId, dto.salaireBrutMensuel, req.user.userId);
  }
}
