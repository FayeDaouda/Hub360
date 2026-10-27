import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { ReglagesService } from './reglages.service';
import { GabaritDto, ValeursDto } from './reglages.dto';

type R = { user: { userId: string; societeId: string } };

// Réglages du HUB : administration de plateforme (CIO, ou l'admin de la
// société), hors matrice des modules — même garde que les gabarits.
@Controller('societes/:slug/reglages')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class ReglagesController {
  constructor(private reglages: ReglagesService) {}

  @Get()
  lire(@Req() req: R) {
    return this.reglages.lire(req.user.societeId);
  }

  @Get('journal')
  journal(@Req() req: R) {
    return this.reglages.journal(req.user.societeId);
  }

  @Put('gabarits/:code')
  gabarit(@Req() req: R, @Param('code') code: string, @Body() dto: GabaritDto) {
    return this.reglages.majGabarit(req.user.societeId, req.user.userId, code, dto);
  }

  @Put('regles')
  regles(@Req() req: R, @Body() dto: ValeursDto) {
    return this.reglages.majValeurs(req.user.societeId, req.user.userId, 'regles', dto);
  }

  @Put('objectifs')
  objectifs(@Req() req: R, @Body() dto: ValeursDto) {
    return this.reglages.majValeurs(req.user.societeId, req.user.userId, 'objectifs', dto);
  }
}
