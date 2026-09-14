import {
  Body,
  Controller,
  Delete,
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
import {
  AjouterLigneChecklistAvpDto,
  PatchAvantProjetDto,
  PatchLigneChecklistAvpDto,
} from './dto';
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
  @Patch('checklist/:ligneId')
  patchChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: PatchLigneChecklistAvpDto,
  ) {
    return this.projets.patchLigneChecklistAvp(req.user.societeId, id, ligneId, dto);
  }

  // Structure de la checklist (ajout/suppression d'items) — admin uniquement :
  // pas de @EcritureCollaborateur, donc fermé par défaut à ce rôle
  // (AccesProjetGuard). Cocher/décocher un item existant reste ouvert
  // au-dessus ; ajouter/retirer un item ne l'est pas.
  @Post('checklist')
  ajouterChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: AjouterLigneChecklistAvpDto,
  ) {
    return this.projets.ajouterLigneChecklistAvp(req.user.societeId, id, dto);
  }

  @Delete('checklist/:ligneId')
  supprimerChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
  ) {
    return this.projets.supprimerLigneChecklistAvp(
      req.user.societeId,
      id,
      ligneId,
      req.user.userId,
    );
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
