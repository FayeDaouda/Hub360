import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { CreerSignalementDto, StatutSignalementDto } from './dto';
import { SignalementsService } from './signalements.service';

type R = { user: { userId: string; societeId: string; role: string } };

// Dépôt : tout compte de la société (Salarié compris).
@Controller('societes/:slug/signalements')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class SignalementsController {
  constructor(private signalements: SignalementsService) {}

  @Post()
  creer(@Req() req: R, @Body() dto: CreerSignalementDto) {
    return this.signalements.creer(req.user, dto);
  }
}

// Suivi : le CIO et l'administration de la société (Réglages › Signalements).
@Controller('societes/:slug/signalements')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class SuiviSignalementsController {
  constructor(private signalements: SignalementsService) {}

  @Get()
  lister(@Req() req: R) {
    return this.signalements.lister(req.user.societeId);
  }

  @Get(':id/capture')
  capture(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.signalements.capture(req.user.societeId, id);
  }

  @Patch(':id')
  statut(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutSignalementDto) {
    return this.signalements.changerStatut(req.user, id, dto.statut);
  }
}
