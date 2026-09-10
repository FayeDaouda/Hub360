import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TypeLot } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { ExecutionService } from './execution.service';
import {
  AjouterCrDto,
  AjouterOffreDto,
  AjouterReserveDto,
  AjouterSituationDto,
  AttribuerLotDto,
  PatchLotDto,
  PatchLotSuiviDto,
  PatchReceptionDto,
  PatchReserveDto,
} from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/projets/:id/execution')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class ExecutionController {
  constructor(private execution: ExecutionService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.execution.get(req.user.societeId, id);
  }

  @Patch('lots/:type')
  patchLot(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Body() dto: PatchLotDto,
  ) {
    return this.execution.patchLot(req.user.societeId, id, type, dto);
  }

  // Suivi opérationnel d'un lot (statut, avancement, planning) — ouvert au
  // collaborateur assigné. Le financier reste sur PATCH lots/:type (admin).
  @EcritureCollaborateur()
  @Patch('lots/:type/suivi')
  patchLotSuivi(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Body() dto: PatchLotSuiviDto,
  ) {
    return this.execution.patchLot(req.user.societeId, id, type, dto);
  }

  @Post('lots/:type/offres')
  ajouterOffre(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Body() dto: AjouterOffreDto,
  ) {
    return this.execution.ajouterOffre(req.user.societeId, id, type, dto);
  }

  @Delete('lots/:type/offres/:offreId')
  supprimerOffre(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Param('offreId') offreId: string,
  ) {
    return this.execution.supprimerOffre(req.user.societeId, id, type, offreId);
  }

  @Post('lots/:type/attribution')
  attribuer(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Body() dto: AttribuerLotDto,
  ) {
    return this.execution.attribuer(req.user.societeId, id, type, dto);
  }

  @Post('lots/:type/situations')
  ajouterSituation(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Body() dto: AjouterSituationDto,
  ) {
    return this.execution.ajouterSituation(req.user.societeId, id, type, dto);
  }

  @Delete('lots/:type/situations/:situationId')
  supprimerSituation(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeLot)) type: TypeLot,
    @Param('situationId') situationId: string,
  ) {
    return this.execution.supprimerSituation(req.user.societeId, id, type, situationId);
  }

  @EcritureCollaborateur()
  @Post('cr')
  ajouterCr(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterCrDto) {
    return this.execution.ajouterCr(req.user.societeId, id, dto, req.user.userId);
  }

  @EcritureCollaborateur()
  @Patch('reception')
  patchReception(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: PatchReceptionDto,
  ) {
    return this.execution.patchReception(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Post('reserves')
  ajouterReserve(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: AjouterReserveDto,
  ) {
    return this.execution.ajouterReserve(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Patch('reserves/:reserveId')
  patchReserve(
    @Req() req: R,
    @Param('id') id: string,
    @Param('reserveId') reserveId: string,
    @Body() dto: PatchReserveDto,
  ) {
    return this.execution.patchReserve(req.user.societeId, id, reserveId, dto);
  }
}
