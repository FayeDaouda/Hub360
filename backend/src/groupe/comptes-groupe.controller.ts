import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdministrationHubGuard } from '../commun/administration-hub.guard';
import { ComptesGroupeService } from './comptes-groupe.service';
import { ChangerRoleDto, DefinirSalaireDto } from './dto';

type R = { user: { userId: string } };

// Écran « Comptes & rôles » — administration du HUB (CIO, ou compte
// technique holding_admin), cf. AdministrationHubGuard.
@Controller('groupe/comptes')
@UseGuards(JwtAuthGuard, AdministrationHubGuard)
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
