import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { GroupeUnbord } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { UnbordService } from './unbord.service';
import {
  JoindreFichiersLigneUnbordDto,
  JoindreImagesLigneUnbordDto,
  PatchBlocUnbordDto,
  PatchLigneUnbordDto,
} from './dto';

type R = { user: { societeId: string; userId: string; role: string } };

// Ouvert à toute l'équipe côté guard (@EcritureCollaborateur) pour l'accès au
// module ; le contrôle fin par bloc (assigné ou libre) vit dans le service
// depuis le 2026-09-25 — cf. UnbordService.verifierAccesBloc. `:ligneId`
// (pas un enum de type figé) — les items viennent du gabarit de la société,
// voir UnbordGabaritController pour leur configuration. `blocs/:groupe`
// déclaré AVANT `:ligneId` : segment statique, sinon Nest le confondrait
// avec un id de ligne.
@Controller('societes/:slug/projets/:id/unbord')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class UnbordController {
  constructor(private unbord: UnbordService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.unbord.get(req.user.societeId, id);
  }

  @EcritureCollaborateur()
  @Patch('blocs/:groupe')
  patchBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeUnbord,
    @Body() dto: PatchBlocUnbordDto,
  ) {
    return this.unbord.patchBloc(req.user.societeId, id, groupe, dto, req.user.userId, req.user.role);
  }

  @EcritureCollaborateur()
  @Patch(':ligneId')
  patchLigne(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: PatchLigneUnbordDto,
  ) {
    return this.unbord.patchLigne(req.user.societeId, id, ligneId, dto, req.user.userId, req.user.role);
  }

  @EcritureCollaborateur()
  @Post(':ligneId/images')
  joindreImages(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: JoindreImagesLigneUnbordDto,
  ) {
    return this.unbord.joindreImages(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  @EcritureCollaborateur()
  @Post(':ligneId/fichiers')
  joindreFichiers(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: JoindreFichiersLigneUnbordDto,
  ) {
    return this.unbord.joindreFichiers(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }
}
