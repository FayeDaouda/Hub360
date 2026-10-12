import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Req, UseGuards } from '@nestjs/common';
import { TypeReporting } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { SaisirDecisionDto } from './dto';
import { AttentionService, type ActeurAttention } from './attention.service';
import { type Acteur, PilotageService } from './pilotage.service';

type R = { user: Acteur & Pick<ActeurAttention, 'permissions'> };

// Pilotage · tableau de bord Holding. Lecture selon la matrice (module
// pilotage) ; les actions vont « par fonction » (choix du 05/10/2026) :
// l'émetteur dépose son reporting, le CTO / CEO saisissent les décisions,
// le responsable, le CTO ou le CEO les clôturent — vérifié par le service.
@Controller('societes/:slug/pilotage')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
@RequiertPermission('pilotage', 'lecture')
export class PilotageController {
  constructor(
    private pilotage: PilotageService,
    private attentionService: AttentionService,
  ) {}

  @Get()
  vue(@Req() req: R) {
    return this.pilotage.vue(req.user);
  }

  // « À votre attention » (accueil du CEO) : chaque rubrique selon la matrice.
  @Get('attention')
  attention(@Req() req: R) {
    return this.attentionService.attention(req.user);
  }

  @Post('reportings/:type/:mois/depot')
  @HttpCode(200)
  deposer(@Req() req: R, @Param('type', new ParseEnumPipe(TypeReporting)) type: TypeReporting, @Param('mois') mois: string) {
    return this.pilotage.deposer(req.user, type, mois);
  }

  @Post('decisions')
  saisir(@Req() req: R, @Body() dto: SaisirDecisionDto) {
    return this.pilotage.saisir(req.user, dto);
  }

  @Post('decisions/:id/cloture')
  @HttpCode(200)
  cloturer(@Req() req: R, @Param('id') id: string) {
    return this.pilotage.cloturer(req.user, id);
  }
}
