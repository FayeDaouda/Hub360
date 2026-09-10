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
import { TypeEtude } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { EtudesService } from './etudes.service';
import { PatchLigneEtudeDto } from './dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/projets/:id/etudes')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class EtudesController {
  constructor(private etudes: EtudesService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.etudes.get(req.user.societeId, id);
  }

  @EcritureCollaborateur()
  @Patch('lignes/:type')
  patchLigne(
    @Req() req: R,
    @Param('id') id: string,
    @Param('type', new ParseEnumPipe(TypeEtude)) type: TypeEtude,
    @Body() dto: PatchLigneEtudeDto,
  ) {
    return this.etudes.patchLigne(req.user.societeId, id, type, dto);
  }

  @EcritureCollaborateur()
  @Post('dce')
  constituerDce(@Req() req: R, @Param('id') id: string) {
    return this.etudes.constituerDce(req.user.societeId, id);
  }

  @EcritureCollaborateur()
  @Delete('dce')
  annulerDce(@Req() req: R, @Param('id') id: string) {
    return this.etudes.annulerDce(req.user.societeId, id);
  }
}
