import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HubAdminGuard } from '../commun/hub-admin.guard';
import { CellulesProjetDto, EtatInterventionsDto, MotifInterventionDto, SuppressionDto } from './interventions.dto';
import { InterventionsService } from './interventions.service';

type R = { user: { userId: string; societeId: string } };

// Déblocages de l'Administrateur HUB (Administration du HUB › Déblocages).
@Controller('societes/:slug/interventions')
@UseGuards(JwtAuthGuard, HubAdminGuard)
export class InterventionsController {
  constructor(private interventions: InterventionsService) {}

  @Get()
  state(@Req() req: R, @Query('code') code = ''): Promise<EtatInterventionsDto> {
    return this.interventions.state(req.user.societeId, code.trim());
  }

  @Post('dossiers/:id/onboard')
  @HttpCode(200)
  onboard(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotifInterventionDto,
  ): Promise<EtatInterventionsDto> {
    return this.interventions.onboardWithoutSignature(req.user.societeId, id, req.user.userId, dto.motif.trim());
  }

  @Post('dossiers/:id/reouverture')
  @HttpCode(200)
  reopen(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotifInterventionDto,
  ): Promise<EtatInterventionsDto> {
    return this.interventions.reopenDossier(req.user.societeId, id, req.user.userId, dto.motif.trim());
  }

  @Post('projets/:id/ouverture')
  @HttpCode(200)
  open(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MotifInterventionDto,
  ): Promise<EtatInterventionsDto> {
    return this.interventions.openProject(req.user.societeId, id, req.user.userId, dto.motif.trim());
  }

  @Put('projets/:id/cellules')
  cells(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CellulesProjetDto,
  ): Promise<EtatInterventionsDto> {
    return this.interventions.setCells(req.user.societeId, id, dto.celluleIds, req.user.userId, dto.motif.trim());
  }

  // Suppression définitive du dossier et/ou du projet portant ce code.
  @Post('suppression')
  @HttpCode(200)
  delete(@Req() req: R, @Body() dto: SuppressionDto): Promise<EtatInterventionsDto> {
    return this.interventions.deleteCode(req.user.societeId, dto.code.trim(), req.user.userId, dto.motif.trim());
  }
}
