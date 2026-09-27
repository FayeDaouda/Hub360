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
import { EtudesGabaritService } from './gabarit.service';
import {
  CreerBlocEtudeGabaritDto,
  CreerLigneEtudeGabaritDto,
  MajBlocEtudeGabaritDto,
  MajLigneEtudeGabaritDto,
  ReordonnerBlocEtudeGabaritDto,
  ReordonnerLigneEtudeGabaritDto,
} from './gabarit.dto';

type R = { user: { societeId: string; userId: string } };

// Configuration société du gabarit Études — societe_admin OU CIO, même motif
// que UnbordGabaritController. Distinct de EtudesController (module métier,
// ouvert à toute l'équipe pour renseigner un projet donné).
@Controller('societes/:slug/etudes-gabarit')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class EtudesGabaritController {
  constructor(private gabarit: EtudesGabaritService) {}

  @Get()
  lister(@Req() req: R) {
    return this.gabarit.listerBlocs(req.user.societeId);
  }

  @Post('blocs')
  creerBloc(@Req() req: R, @Body() dto: CreerBlocEtudeGabaritDto) {
    return this.gabarit.creerBloc(req.user.societeId, dto);
  }

  @Patch('blocs/reordonner')
  @HttpCode(200)
  reordonnerBlocs(@Req() req: R, @Body() dto: ReordonnerBlocEtudeGabaritDto) {
    return this.gabarit.reordonnerBlocs(req.user.societeId, dto);
  }

  @Patch('blocs/:id')
  renommerBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: MajBlocEtudeGabaritDto,
  ) {
    return this.gabarit.renommerBloc(req.user.societeId, id, dto);
  }

  @Delete('blocs/:id')
  @HttpCode(204)
  supprimerBloc(@Req() req: R, @Param('id') id: string) {
    return this.gabarit.supprimerBloc(req.user.societeId, id, req.user.userId);
  }

  @Post('blocs/:blocId/lignes')
  creerLigne(
    @Req() req: R,
    @Param('blocId') blocId: string,
    @Body() dto: CreerLigneEtudeGabaritDto,
  ) {
    return this.gabarit.creerLigne(req.user.societeId, blocId, dto);
  }

  @Patch('blocs/:blocId/lignes/reordonner')
  @HttpCode(200)
  reordonnerLignes(
    @Req() req: R,
    @Param('blocId') blocId: string,
    @Body() dto: ReordonnerLigneEtudeGabaritDto,
  ) {
    return this.gabarit.reordonnerLignes(req.user.societeId, blocId, dto);
  }

  @Patch('lignes/:id')
  renommerLigne(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: MajLigneEtudeGabaritDto,
  ) {
    return this.gabarit.renommerLigne(req.user.societeId, id, dto);
  }

  @Delete('lignes/:id')
  @HttpCode(204)
  supprimerLigne(@Req() req: R, @Param('id') id: string) {
    return this.gabarit.supprimerLigne(req.user.societeId, id, req.user.userId);
  }
}
