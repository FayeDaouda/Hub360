import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NiveauPermission } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ProjetsOuvertsService } from './projets-ouverts.service';
import { TachesProjetService } from './taches-projet.service';
import { AjouterTsDto, AssignerTacheDto, DateVisiteDto, StatutChantierDto, DeciderProlongationTacheDto, DeciderTacheDto, DemanderProlongationTacheDto, PublierCommentaireDto, RemettreTacheDto } from './dto';
import { FilsProjetService } from './fils-projet.service';

type R = { user: { societeId: string; userId: string; role: string; permissions?: Record<string, NiveauPermission> } };

// Projets ouverts selon le gabarit (maquette « Projets » du boss).
@Controller('societes/:slug/projets-ouverts')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ProjetsOuvertsController {
  constructor(
    private projets: ProjetsOuvertsService,
    private taches: TachesProjetService,
    private fils: FilsProjetService,
  ) {}

  @Get()
  @RequiertPermission('projets', 'lecture')
  tableau(@Req() req: R) {
    return this.projets.tableau(req.user.societeId, req.user);
  }

  // Segment fixe, déclaré avant ':id'.
  @Get('assignables')
  @RequiertPermission('projets', 'ecriture')
  assignables(@Req() req: R) {
    return this.taches.assignables(req.user.societeId);
  }

  @Get('mentionnables')
  @RequiertPermission('projets', 'lecture')
  mentionnables(@Req() req: R) {
    return this.fils.mentionnables(req.user.societeId);
  }

  @Get(':id')
  @RequiertPermission('projets', 'lecture')
  dossier(@Req() req: R, @Param('id') id: string) {
    return this.projets.dossier(req.user.societeId, id, req.user);
  }

  @Patch(':id/chantier')
  @RequiertPermission('projets', 'ecriture')
  definirStatutChantier(@Req() req: R, @Param('id') id: string, @Body() dto: StatutChantierDto) {
    return this.projets.definirStatutChantier(req.user.societeId, id, dto.statut);
  }

  @Patch(':id/visite')
  @RequiertPermission('projets', 'ecriture')
  definirDateVisite(@Req() req: R, @Param('id') id: string, @Body() dto: DateVisiteDto) {
    return this.projets.definirDateVisite(req.user.societeId, id, dto.date);
  }

  @Get(':id/taches/:tacheId/historique')
  @RequiertPermission('projets', 'lecture')
  async historique(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string) {
    await this.fils.verifierLecture(req.user.societeId, req.user, id);
    return this.taches.historique(req.user.societeId, id, tacheId);
  }

  // « Lecture et assignation » : l'écriture sur Projets suffit.
  @Patch(':id/taches/:tacheId/assignation')
  @RequiertPermission('projets', 'ecriture')
  assigner(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: AssignerTacheDto) {
    return this.taches.assigner(req.user.societeId, req.user, id, tacheId, dto.collaborateurId, !!dto.carte);
  }

  // Remise par la personne assignée (vérifié par le service) — le Salarié n'a
  // que la lecture sur Projets.
  @Post(':id/taches/:tacheId/remise')
  @RequiertPermission('projets', 'lecture')
  remettre(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: RemettreTacheDto) {
    return this.taches.remettre(req.user.societeId, req.user, id, tacheId, dto);
  }

  // Fichier d'une remise : quiconque voit le projet (même règle que l'historique).
  @Get(':id/taches/:tacheId/pieces/:pieceId')
  @RequiertPermission('projets', 'lecture')
  async piece(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Param('pieceId') pieceId: string) {
    await this.fils.verifierLecture(req.user.societeId, req.user, id);
    return this.taches.piece(req.user.societeId, id, tacheId, pieceId);
  }

  // Prolongation : demande de l'assigné, décision du chef de team ou du DPLG
  // (droits vérifiés par le service).
  @Post(':id/taches/:tacheId/prolongation')
  @RequiertPermission('projets', 'lecture')
  demanderProlongation(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: DemanderProlongationTacheDto) {
    return this.taches.demanderProlongation(req.user.societeId, req.user, id, tacheId, dto.jusquau, dto.motif);
  }

  @Post(':id/taches/:tacheId/prolongation/decision')
  @RequiertPermission('projets', 'lecture')
  deciderProlongation(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: DeciderProlongationTacheDto) {
    return this.taches.deciderProlongation(req.user.societeId, req.user, id, tacheId, dto.accorder);
  }

  // Remise : valider ou renvoyer en reprise (droits vérifiés par le service).
  // Lecture suffit : le chef de team peut être Salarié ; le service vérifie
  // qu'il s'agit du chef de team du projet ou de l'Architecte DPLG.
  @Post(':id/taches/:tacheId/decision')
  @RequiertPermission('projets', 'lecture')
  decider(@Req() req: R, @Param('id') id: string, @Param('tacheId') tacheId: string, @Body() dto: DeciderTacheDto) {
    return this.taches.decider(req.user.societeId, req.user, id, tacheId, dto.decision, dto.motif);
  }

  @Post(':id/ts')
  @RequiertPermission('projets', 'ecriture')
  ajouterTs(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterTsDto) {
    return this.taches.ajouterTs(req.user.societeId, req.user, id, dto.carteId, dto.element);
  }

  // Fil d'une carte (?carte=) ou d'une tâche (?tache=).
  @Get(':id/fil')
  @RequiertPermission('projets', 'lecture')
  async fil(@Req() req: R, @Param('id') id: string, @Query('carte') carteId?: string, @Query('tache') tacheId?: string) {
    await this.fils.verifierLecture(req.user.societeId, req.user, id);
    return this.fils.lire(req.user.societeId, id, { carteId, tacheId });
  }

  // Écriture sur Projets, ou Salarié sur un de ses projets (cf. verifierEcriture).
  @Post(':id/fil')
  @RequiertPermission('projets', 'lecture')
  async publier(@Req() req: R, @Param('id') id: string, @Body() dto: PublierCommentaireDto) {
    await this.fils.verifierEcriture(req.user.societeId, req.user, id);
    return this.fils.publier(req.user.societeId, req.user, id, dto);
  }

  @Post(':id/fil/:commentaireId/resolution')
  @RequiertPermission('projets', 'lecture')
  async resoudre(@Req() req: R, @Param('id') id: string, @Param('commentaireId') commentaireId: string) {
    await this.fils.verifierEcriture(req.user.societeId, req.user, id);
    return this.fils.resoudre(req.user.societeId, req.user, id, commentaireId);
  }
}
