import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdministrationHubGuard } from '../commun/administration-hub.guard';
import { ComptesGroupeService } from './comptes-groupe.service';
import { ChangerActifDto, ChangerRoleDto, CreerCompteDto } from './dto';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

type R = { user: { userId: string } };

// Écran « Comptes & rôles » — administration du HUB (CIO, ou compte
// technique holding_admin), cf. AdministrationHubGuard.
@GroupScope()
@Controller('groupe/comptes')
@UseGuards(JwtAuthGuard, AdministrationHubGuard)
export class ComptesGroupeController {
  constructor(private comptes: ComptesGroupeService) {}

  @Get()
  lister() {
    return this.comptes.lister();
  }

  @Post()
  creer(@Req() req: R, @Body() dto: CreerCompteDto) {
    return this.comptes.creerCompte(dto, req.user.userId);
  }

  @Post(':utilisateurId/invitation')
  renvoyerInvitation(@Req() req: R, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.comptes.renvoyerInvitation(utilisateurId, req.user.userId);
  }

  @Post(':utilisateurId/double-facteur/reinitialisation')
  reinitialiserDoubleFacteur(@Req() req: R, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.comptes.reinitialiserDoubleFacteur(utilisateurId, req.user.userId);
  }

  @Post(':utilisateurId/sessions/coupure')
  couperSessions(@Req() req: R, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.comptes.couperSessions(utilisateurId, req.user.userId);
  }

  @Post(':utilisateurId/mot-de-passe/reinitialisation')
  envoyerReinitialisation(@Req() req: R, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.comptes.envoyerReinitialisation(utilisateurId, req.user.userId);
  }

  // Compte verrouillé après trop d'essais (lot C) : débloqué avant la fin.
  @Post(':utilisateurId/deblocage')
  debloquer(@Req() req: R, @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string) {
    return this.comptes.debloquer(utilisateurId, req.user.userId);
  }

  @Put(':utilisateurId/actif')
  changerActif(
    @Req() req: R,
    @Param('utilisateurId', ParseUUIDPipe) utilisateurId: string,
    @Body() dto: ChangerActifDto,
  ) {
    return this.comptes.changerActif(utilisateurId, dto.actif, req.user.userId);
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
}
