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
import { CleChecklistAvp } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { PatchAvantProjetDto, PatchLigneChecklistAvpDto } from './dto';
import { EcritureCollaborateur } from './ecriture-collaborateur.decorator';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/projets/:id/avant-projet')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class AvantProjetController {
  constructor(private projets: ProjetsService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.projets.getAvantProjet(req.user.societeId, id);
  }

  @Patch()
  patch(@Req() req: R, @Param('id') id: string, @Body() dto: PatchAvantProjetDto) {
    return this.projets.patchAvantProjet(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Patch('checklist/:cle')
  patchChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('cle', new ParseEnumPipe(CleChecklistAvp)) cle: CleChecklistAvp,
    @Body() dto: PatchLigneChecklistAvpDto,
  ) {
    return this.projets.patchLigneChecklistAvp(req.user.societeId, id, cle, dto);
  }

  @Post('validation')
  valider(@Req() req: R, @Param('id') id: string) {
    return this.projets.validerAvantProjet(req.user.societeId, id, req.user.userId);
  }

  @Delete('validation')
  devalider(@Req() req: R, @Param('id') id: string) {
    return this.projets.devaliderAvantProjet(req.user.societeId, id);
  }
}
