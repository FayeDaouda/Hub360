import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SocieteAdminOuCioGuard } from '../../commun/societe-admin-ou-cio.guard';
import { UnbordGabaritService } from './gabarit.service';
import {
  CreerLigneUnbordGabaritDto,
  MajLigneUnbordGabaritDto,
  ReordonnerLigneUnbordGabaritDto,
} from './gabarit.dto';

type R = { user: { societeId: string; userId: string } };

// Configuration société du gabarit Unbord — societe_admin OU CIO, pas la
// matrice RolePermission (c'est de l'administration de plateforme, pas un
// module métier). Distinct de UnbordController (qui reste ouvert à toute
// l'équipe pour uploader sur un projet donné).
@Controller('societes/:slug/unbord-gabarit')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class UnbordGabaritController {
  constructor(private gabarit: UnbordGabaritService) {}

  @Get()
  lister(@Req() req: R) {
    return this.gabarit.lister(req.user.societeId);
  }

  @Post()
  creer(@Req() req: R, @Body() dto: CreerLigneUnbordGabaritDto) {
    return this.gabarit.creer(req.user.societeId, dto);
  }

  @Patch('reordonner')
  @HttpCode(200)
  reordonner(@Req() req: R, @Body() dto: ReordonnerLigneUnbordGabaritDto) {
    return this.gabarit.reordonner(req.user.societeId, dto);
  }

  @Patch(':id')
  renommer(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: MajLigneUnbordGabaritDto,
  ) {
    return this.gabarit.renommer(req.user.societeId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  supprimer(@Req() req: R, @Param('id') id: string) {
    return this.gabarit.supprimer(req.user.societeId, id, req.user.userId);
  }
}
