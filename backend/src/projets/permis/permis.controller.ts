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
import { GroupeChecklistPermis } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { PermissionSelonMethode } from '../../commun/permission.decorator';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { PermisService } from './permis.service';
import {
  AjouterLigneChecklistPermisDto,
  DeciderProlongationBlocDto,
  DemanderProlongationBlocDto,
  JoindreFichiersLigneDto,
  JoindreImagesLigneDto,
  PatchBlocPermisDto,
  PatchLigneChecklistPermisDto,
  PatchPermisDto,
} from './dto';

type R = { user: { societeId: string; userId: string; role: string } };

@Controller('societes/:slug/projets/:id/permis')
@PermissionSelonMethode('projets', { roleHorsMatrice: 'collaborateur' })
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class PermisController {
  constructor(private permis: PermisService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.permis.get(req.user.societeId, id);
  }

  // Ouvert à toute l'équipe côté guard (@EcritureCollaborateur) : le contrôle
  // fin (responsable du bloc « Dossier de permis » + admin) est en service.
  @EcritureCollaborateur()
  @Patch()
  patch(@Req() req: R, @Param('id') id: string, @Body() dto: PatchPermisDto) {
    return this.permis.patch(req.user.societeId, id, dto, req.user.userId, req.user.role);
  }

  @EcritureCollaborateur()
  @Patch('checklist/:ligneId')
  patchChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: PatchLigneChecklistPermisDto,
  ) {
    return this.permis.patchLigneChecklist(
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
    @Body() dto: AjouterLigneChecklistPermisDto,
  ) {
    return this.permis.ajouterLigneChecklist(req.user.societeId, id, dto);
  }

  @Delete('checklist/:ligneId')
  supprimerChecklist(
    @Req() req: R,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
  ) {
    return this.permis.supprimerLigneChecklist(
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
    return this.permis.joindreImages(
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
    return this.permis.joindreFichiers(
      req.user.societeId,
      id,
      ligneId,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // Pièces jointes rattachées au BLOC entier — Dépôt urbanisme / Procédure
  // (sept. 2026) : un seul point d'upload partagé, pas de bouton par item.
  // Même garde que ci-dessus (responsable du bloc + admin, en service).
  @EcritureCollaborateur()
  @Post('blocs/:groupe/images')
  joindreImagesBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistPermis,
    @Body() dto: JoindreImagesLigneDto,
  ) {
    return this.permis.joindreImagesBloc(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  @EcritureCollaborateur()
  @Post('blocs/:groupe/fichiers')
  joindreFichiersBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistPermis,
    @Body() dto: JoindreFichiersLigneDto,
  ) {
    return this.permis.joindreFichiersBloc(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
      req.user.role,
    );
  }

  // -- Blocs (Dossier de permis / Dépôt urbanisme / Procédure) --------------
  // Échéance + responsable par bloc — cf. mémoire du 2026-09-17.

  // Échéance + responsable du bloc — admin OU dispatcher de la cellule du
  // responsable ciblé (décision boss, sept. 2026). Ouvert à
  // @EcritureCollaborateur pour les dispatchers ; contrôle fin en service.
  @EcritureCollaborateur()
  @Patch('blocs/:groupe')
  patchBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('groupe') groupe: GroupeChecklistPermis,
    @Body() dto: PatchBlocPermisDto,
  ) {
    return this.permis.patchBloc(
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
    @Param('groupe') groupe: GroupeChecklistPermis,
    @Body() dto: DemanderProlongationBlocDto,
  ) {
    return this.permis.demanderProlongationBloc(
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
    @Param('groupe') groupe: GroupeChecklistPermis,
    @Body() dto: DeciderProlongationBlocDto,
  ) {
    return this.permis.deciderProlongationBloc(
      req.user.societeId,
      id,
      groupe,
      dto,
      req.user.userId,
    );
  }
}
