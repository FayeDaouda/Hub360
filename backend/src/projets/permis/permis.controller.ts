import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { PermisService } from './permis.service';
import { AjouterEntreeJournalDto, PatchPermisDto } from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/projets/:id/permis')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class PermisController {
  constructor(private permis: PermisService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.permis.get(req.user.societeId, id);
  }

  @EcritureCollaborateur()
  @Patch()
  patch(@Req() req: R, @Param('id') id: string, @Body() dto: PatchPermisDto) {
    return this.permis.patch(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Post('journal')
  ajouterEntree(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: AjouterEntreeJournalDto,
  ) {
    return this.permis.ajouterEntreeJournal(
      req.user.societeId,
      id,
      dto.texte,
      req.user.userId,
    );
  }
}
