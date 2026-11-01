import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import {
  DecisionEmbaucheDto,
  DecisionPosteDto,
  DemandePosteDto,
  NoteCandidatDto,
  NouveauCandidatDto,
} from './recrutement.dto';
import { RecrutementService } from './recrutement.service';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Recrutement (lot 13, 01/11/2026) : chaque route nomme son étape.
@Controller('societes/:slug/recrutement')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class RecrutementController {
  constructor(private recrutement: RecrutementService) {}

  @Get()
  @RequiertPermission(ETAPE.recrutementPostes, 'lecture')
  vue(@Req() req: R) {
    return this.recrutement.vue(req.user);
  }

  @Post('postes')
  @RequiertPermission(ETAPE.recrutementPostes, 'ecriture')
  demanderPoste(@Req() req: R, @Body() dto: DemandePosteDto) {
    return this.recrutement.demanderPoste(req.user, dto);
  }

  @Post('postes/:id/decision')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementPostes, 'validation')
  deciderPoste(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionPosteDto) {
    return this.recrutement.deciderPoste(req.user, id, dto);
  }

  @Post('postes/:id/fermeture')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementPostes, 'suppression')
  fermerPoste(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.fermerPoste(req.user, id);
  }

  @Get('postes/:id/candidats')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'lecture')
  candidats(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.candidats(req.user, id);
  }

  @Post('postes/:id/candidats')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'ecriture')
  ajouterCandidat(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NouveauCandidatDto) {
    return this.recrutement.ajouterCandidat(req.user, id, dto);
  }

  @Post('candidats/:id/notes')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementCandidatures, 'ecriture')
  noter(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteCandidatDto) {
    return this.recrutement.noter(req.user, id, dto);
  }

  @Post('candidats/:id/decision')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementDecision, 'validation')
  decider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionEmbaucheDto) {
    return this.recrutement.decider(req.user, id, dto);
  }

  @Delete('candidats/:id')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'suppression')
  retirerCandidat(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.retirerCandidat(req.user, id);
  }
}
