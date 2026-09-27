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
import { GroupeChecklistAvp } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import {
  AjouterLigneChecklistAvpDto,
  DeciderProlongationBlocChecklistAvpDto,
  DemanderProlongationBlocChecklistAvpDto,
  JoindreFichiersLigneChecklistAvpDto,
  JoindreImagesLigneChecklistAvpDto,
  PatchAvantProjetDto,
  PatchBlocChecklistAvpDto,
  PatchLigneChecklistAvpDto,
} from './dto';
import { EcritureCollaborateur } from './ecriture-collaborateur.decorator';

type R = { user: { societeId: string; userId: string; role: string } };

// Restructuré sept. 2026 : assignation PAR BLOC (comme Permis/Exécution),
// items à statut dérivé des fichiers joints (comme Foncier/Unbord). Ouvert à
// toute l'équipe côté guard (@EcritureCollaborateur) pour l'accès aux
// mutations ; le contrôle fin (bloc assigné ou libre, dispatcher de la bonne
// cellule…) vit dans ProjetsService. `blocs/:groupe` déclaré AVANT
// `checklist/:ligneId` : segment statique, sinon Nest le confondrait avec un
// id de ligne.
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
  @Patch('blocs/:groupe')
  patchBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistAvp,
    @Body() dto: PatchBlocChecklistAvpDto,
  ) {
    return this.projets.patchBlocChecklistAvp(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // Demande de prolongation — ouvert à toute l'équipe du projet côté guard,
  // restreint au SEUL responsable de ce bloc en service.
  @EcritureCollaborateur()
  @Post('blocs/:groupe/prolongation')
  demanderProlongation(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistAvp,
    @Body() dto: DemanderProlongationBlocChecklistAvpDto,
  ) {
    return this.projets.demanderProlongationBlocChecklistAvp(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
    );
  }

  // Décision admin sur une demande en attente — admin uniquement.
  @Patch('blocs/:groupe/prolongation')
  deciderProlongation(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistAvp,
    @Body() dto: DeciderProlongationBlocChecklistAvpDto,
  ) {
    return this.projets.deciderProlongationBlocChecklistAvp(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
    );
  }

  @EcritureCollaborateur()
  @Patch('checklist/:ligneId')
  patchChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: PatchLigneChecklistAvpDto,
  ) {
    return this.projets.patchLigneChecklistAvp(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  @EcritureCollaborateur()
  @Post('checklist/:ligneId/images')
  joindreImages(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: JoindreImagesLigneChecklistAvpDto,
  ) {
    return this.projets.joindreImagesChecklistAvp(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  @EcritureCollaborateur()
  @Post('checklist/:ligneId/fichiers')
  joindreFichiers(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: JoindreFichiersLigneChecklistAvpDto,
  ) {
    return this.projets.joindreFichiersChecklistAvp(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // Structure de la checklist (ajout/suppression d'items) — admin OU
  // dispatcher d'une cellule du projet (nouveauté sept. 2026). Ouvert à
  // @EcritureCollaborateur pour laisser passer les dispatchers ; le contrôle
  // fin est en service (estDispatcherDuneCelluleDuProjet).
  @EcritureCollaborateur()
  @Post('checklist')
  ajouterChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: AjouterLigneChecklistAvpDto,
  ) {
    return this.projets.ajouterLigneChecklistAvp(
      req.user.societeId,
      id,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  @EcritureCollaborateur()
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
      req.user.role,
    );
  }
}
