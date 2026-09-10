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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { PatchVersionDto } from './dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/projets/:id/pre-bilan')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class PreBilanController {
  constructor(private projets: ProjetsService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.projets.getPreBilan(req.user.societeId, id);
  }

  @Post('versions')
  ajouterVersion(@Req() req: R, @Param('id') id: string) {
    return this.projets.ajouterVersion(req.user.societeId, id);
  }

  @Patch('versions/:etape')
  patchVersion(
    @Req() req: R,
    @Param('id') id: string,
    @Param('etape') etape: string,
    @Body() dto: PatchVersionDto,
  ) {
    return this.projets.patchVersion(req.user.societeId, id, etape, dto);
  }
}
