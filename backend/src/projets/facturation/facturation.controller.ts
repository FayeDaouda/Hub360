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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { FacturationService } from './facturation.service';
import {
  AjouterPaiementDto,
  CreerEcheancierDto,
  CreerFactureDto,
  PatchFactureDto,
} from './dto';

type R = { user: { societeId: string; userId: string } };

// Aucun endpoint n'est marqué @EcritureCollaborateur : AccesProjetGuard rejette
// donc toute écriture d'un collaborateur (403). Émission et gestion des factures
// = admin uniquement (cadrage §8), cohérent avec le pré-bilan et les situations
// de paiement de l'exécution. La lecture (GET) suit la règle projet habituelle.
@Controller('societes/:slug/projets/:id/factures')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class FacturationController {
  constructor(private facturation: FacturationService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.facturation.get(req.user.societeId, id);
  }

  @Post()
  creer(@Req() req: R, @Param('id') id: string, @Body() dto: CreerFactureDto) {
    return this.facturation.creer(req.user.societeId, id, dto);
  }

  @Post('echeancier')
  creerEcheancier(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: CreerEcheancierDto,
  ) {
    return this.facturation.creerEcheancier(req.user.societeId, id, dto);
  }

  @Patch(':factureId')
  patch(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: PatchFactureDto,
  ) {
    return this.facturation.patch(req.user.societeId, id, factureId, dto);
  }

  @Post(':factureId/emission')
  emettre(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.emettre(req.user.societeId, id, factureId);
  }

  @Delete(':factureId')
  supprimer(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.supprimer(req.user.societeId, id, factureId);
  }

  @Post(':factureId/avoir')
  creerAvoir(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.creerAvoir(req.user.societeId, id, factureId);
  }

  @Post(':factureId/paiements')
  ajouterPaiement(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: AjouterPaiementDto,
  ) {
    return this.facturation.ajouterPaiement(req.user.societeId, id, factureId, dto);
  }

  @Delete(':factureId/paiements/:paiementId')
  supprimerPaiement(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Param('paiementId') paiementId: string,
  ) {
    return this.facturation.supprimerPaiement(
      req.user.societeId,
      id,
      factureId,
      paiementId,
    );
  }
}
