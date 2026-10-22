import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TypeReporting } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { ArbitrerDecisionDto, DeposerReportingDto, MessageReportingDto, SaisirDecisionDto } from './dto';
import { SuiviReportingService } from './suivi-reporting.service';
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
    private suivi: SuiviReportingService,
  ) {}

  @Get()
  vue(@Req() req: R) {
    return this.pilotage.vue(req.user);
  }

  // Reportings à déposer par l'acteur (« À traiter » de la page RH).
  @Get('reportings/a-deposer')
  aDeposer(@Req() req: R) {
    return this.pilotage.aDeposer(req.user);
  }

  // Reportings reçus (destinataire) pour le dernier mois clos.
  @Get('reportings/recus')
  recus(@Req() req: R) {
    return this.pilotage.recus(req.user);
  }

  // « À votre attention » (accueil du CEO) : chaque rubrique selon la matrice.
  @Get('attention')
  attention(@Req() req: R) {
    return this.attentionService.attention(req.user);
  }

  @Post('reportings/:type/:mois/depot')
  @HttpCode(200)
  deposer(
    @Req() req: R,
    @Param('type', new ParseEnumPipe(TypeReporting)) type: TypeReporting,
    @Param('mois') mois: string,
    @Body() dto: DeposerReportingDto,
  ) {
    return this.pilotage.deposer(req.user, type, mois, dto.analyse);
  }

  // Suivi d'un reporting déposé (revue CFO, lot 5) : droits vérifiés par le
  // service (destinataire : lu / question ; émetteur : réponse).
  @Get('reportings/questions-ouvertes')
  questionsOuvertes(@Req() req: R) {
    return this.suivi.questionsOuvertes(req.user);
  }

  @Post('reportings/:type/:mois/lecture')
  @HttpCode(200)
  async lire(@Req() req: R, @Param('type', new ParseEnumPipe(TypeReporting)) type: TypeReporting, @Param('mois') mois: string) {
    await this.suivi.lire(req.user, type, mois);
    return this.pilotage.vue(req.user);
  }

  @Post('reportings/:type/:mois/questions')
  @HttpCode(200)
  async questionner(
    @Req() req: R,
    @Param('type', new ParseEnumPipe(TypeReporting)) type: TypeReporting,
    @Param('mois') mois: string,
    @Body() dto: MessageReportingDto,
  ) {
    await this.suivi.questionner(req.user, type, mois, dto.texte);
    return this.pilotage.vue(req.user);
  }

  @Post('reportings/:type/:mois/questions/:questionId/reponse')
  @HttpCode(200)
  async repondre(
    @Req() req: R,
    @Param('type', new ParseEnumPipe(TypeReporting)) type: TypeReporting,
    @Param('mois') mois: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: MessageReportingDto,
  ) {
    await this.suivi.repondre(req.user, type, mois, questionId, dto.texte);
    return this.pilotage.vue(req.user);
  }

  // Décisions rattachées à une fiche (?projet= | ?cellule= | ?client=).
  @Get('decisions')
  decisionsRattachees(@Req() req: R, @Query('projet') projetId?: string, @Query('cellule') celluleId?: string, @Query('client') clientId?: string) {
    return this.pilotage.decisionsRattachees(req.user, { projetId, celluleId, clientId });
  }

  @Post('decisions')
  saisir(@Req() req: R, @Body() dto: SaisirDecisionDto) {
    return this.pilotage.saisir(req.user, dto);
  }

  // Décision proposée par le CTO : le CEO l'accepte, la modifie ou la refuse.
  @Post('decisions/:id/arbitrage')
  @HttpCode(200)
  arbitrer(@Req() req: R, @Param('id') id: string, @Body() dto: ArbitrerDecisionDto) {
    return this.pilotage.arbitrer(req.user, id, dto);
  }

  @Post('decisions/:id/cloture')
  @HttpCode(200)
  cloturer(@Req() req: R, @Param('id') id: string) {
    return this.pilotage.cloturer(req.user, id);
  }
}
