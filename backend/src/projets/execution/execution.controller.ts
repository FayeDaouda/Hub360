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
import { GroupeChecklistExecution } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { ExecutionService } from './execution.service';
import {
  AjouterLigneChecklistExecutionDto,
  DeciderProlongationBlocExecutionDto,
  DemanderProlongationBlocExecutionDto,
  JoindreFichiersLigneDto,
  JoindreImagesLigneDto,
  PatchBlocExecutionDto,
  PatchLigneChecklistExecutionDto,
} from './dto';

type R = { user: { societeId: string; userId: string; role: string } };

@Controller('societes/:slug/projets/:id/execution')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class ExecutionController {
  constructor(private execution: ExecutionService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.execution.get(req.user.societeId, id);
  }

  // Ouvert à toute l'équipe côté guard (@EcritureCollaborateur) : le contrôle
  // fin (responsable du bloc + admin) est en service.
  @EcritureCollaborateur()
  @Patch('checklist/:ligneId')
  patchChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: PatchLigneChecklistExecutionDto,
  ) {
    return this.execution.patchLigneChecklist(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // Structure de la checklist (ajout/suppression d'items) — admin uniquement.
  @Post('checklist')
  ajouterChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: AjouterLigneChecklistExecutionDto,
  ) {
    return this.execution.ajouterLigneChecklist(req.user.societeId, id, dto);
  }

  @Delete('checklist/:ligneId')
  supprimerChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
  ) {
    return this.execution.supprimerLigneChecklist(
      req.user.societeId,
      id,
      ligneId,
      req.user.userId,
    );
  }

  // Pièces jointes rattachées à une ligne — ouvert à toute l'équipe côté
  // guard, restreint au responsable du bloc de cette ligne + admin en service.
  @EcritureCollaborateur()
  @Post('checklist/:ligneId/images')
  joindreImages(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: JoindreImagesLigneDto,
  ) {
    return this.execution.joindreImages(
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
    @Body() dto: JoindreFichiersLigneDto,
  ) {
    return this.execution.joindreFichiers(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // -- Blocs (Études / Les Plans / Viabilité / Locaux techniques /
  // Aménagements / Cahiers de menuiserie / Détails / CCTP) ------------------
  // Échéance + responsable par bloc — cf. mémoire du 2026-09-17.

  // Échéance + responsable du bloc — admin OU dispatcher de la cellule du
  // responsable ciblé (décision boss, sept. 2026). Ouvert à
  // @EcritureCollaborateur pour les dispatchers ; contrôle fin en service.
  @EcritureCollaborateur()
  @Patch('blocs/:groupe')
  patchBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistExecution,
    @Body() dto: PatchBlocExecutionDto,
  ) {
    return this.execution.patchBloc(
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
  demanderProlongationBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistExecution,
    @Body() dto: DemanderProlongationBlocExecutionDto,
  ) {
    return this.execution.demanderProlongationBloc(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
    );
  }

  // Décision admin sur une demande en attente — même chemin, méthode différente.
  @Patch('blocs/:groupe/prolongation')
  deciderProlongationBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistExecution,
    @Body() dto: DeciderProlongationBlocExecutionDto,
  ) {
    return this.execution.deciderProlongationBloc(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
    );
  }
}
