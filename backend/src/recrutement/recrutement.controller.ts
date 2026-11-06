import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { AppelsService } from './appels.service';
import {
  AppelDto,
  DecisionEmbaucheDto,
  DecisionPosteDto,
  DemandePosteDto,
  EmbaucheDirecteDto,
  EntretienDto,
  EtatAppelDto,
  NoteCandidatDto,
  NouveauCandidatDto,
} from './recrutement.dto';
import { RecrutementService } from './recrutement.service';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Recrutement (lot 13, 01/11/2026) : chaque route nomme son étape.
@Controller('societes/:slug/recrutement')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class RecrutementController {
  constructor(
    private recrutement: RecrutementService,
    private appels: AppelsService,
  ) {}

  @Get()
  @RequiertPermission(ETAPE.recrutementPostes, 'lecture')
  vue(@Req() req: R) {
    return this.recrutement.vue(req.user);
  }

  // Toutes les sociétés du groupe (lecture seule).
  @Get('groupe')
  @RequiertPermission(ETAPE.recrutementGroupe, 'lecture')
  groupe() {
    return this.recrutement.groupe();
  }

  // Embauche directe : sans poste ni candidature à trier.
  @Post('embauche-directe')
  @RequiertPermission(ETAPE.recrutementDirect, 'ecriture')
  embaucheDirecte(@Req() req: R, @Body() dto: EmbaucheDirecteDto) {
    return this.recrutement.embaucheDirecte(req.user, dto);
  }

  @Post('postes')
  @RequiertPermission(ETAPE.recrutementPostes, 'ecriture')
  demanderPoste(@Req() req: R, @Body() dto: DemandePosteDto) {
    return this.recrutement.demanderPoste(req.user, dto);
  }

  @Post('postes/:id/decision')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementPostes, 'validation')
  deciderPoste(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionPosteDto) {
    return this.recrutement.deciderPoste(req.user, id, dto);
  }

  @Post('postes/:id/fermeture')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementPostes, 'suppression')
  fermerPoste(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.fermerPoste(req.user, id);
  }

  // Appel à candidatures du poste : créé ou mis à jour (son lien ne change pas).
  @Post('postes/:id/appel')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementAppels, 'ecriture')
  enregistrerAppel(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AppelDto) {
    return this.appels.enregistrer(req.user, id, dto);
  }

  @Post('postes/:id/appel/etat')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementAppels, 'ecriture')
  etatAppel(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EtatAppelDto) {
    return this.appels.changerEtat(req.user, id, dto.ouvert);
  }

  // Fiche complète d'un candidat (réponses, pièces) et ses pièces.
  @Get('candidats/:id')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'lecture')
  fiche(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.fiche(req.user, id);
  }

  @Get('candidats/:id/pieces/:pieceId')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'lecture')
  piece(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Param('pieceId', ParseUUIDPipe) pieceId: string) {
    return this.recrutement.piece(req.user, id, pieceId);
  }

  @Get('postes/:id/candidats')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'lecture')
  candidats(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.candidats(req.user, id);
  }

  @Post('postes/:id/candidats')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'ecriture')
  ajouterCandidat(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NouveauCandidatDto) {
    return this.recrutement.ajouterCandidat(req.user, id, dto);
  }

  // Entretien planifié : un rendez-vous de l'Agenda.
  @Post('candidats/:id/entretien')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementCandidatures, 'ecriture')
  entretien(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EntretienDto) {
    return this.recrutement.planifierEntretien(req.user, id, dto);
  }

  @Post('candidats/:id/notes')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementCandidatures, 'ecriture')
  noter(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteCandidatDto) {
    return this.recrutement.noter(req.user, id, dto);
  }

  @Post('candidats/:id/decision')
  @HttpCode(200)
  @RequiertPermission(ETAPE.recrutementDecision, 'validation')
  decider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionEmbaucheDto) {
    return this.recrutement.decider(req.user, id, dto);
  }

  @Delete('candidats/:id')
  @RequiertPermission(ETAPE.recrutementCandidatures, 'suppression')
  retirerCandidat(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.recrutement.retirerCandidat(req.user, id);
  }
}
