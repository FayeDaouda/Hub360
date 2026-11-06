import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FactureStatut } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ValidationCeoAuDelaDuSeuil } from '../../finances/seuil-ceo.guard';
import { FacturationService } from './facturation.service';
import {
  AjouterPaiementDto,
  CreerFactureDirecteDto,
  DecisionAvoirDto,
  FormatNumerotationDto,
  ProfilFacturationDto,
  ReouvertureDto,
} from './dto';
import { ParametresFacturationService } from './parametres-facturation.service';
import { ControleInterneService } from './controle-interne.service';
import { ETAPE } from '@hub/domain';

type R = { user: { societeId: string; userId: string; role: string } };

// Vue centralisée (page « Facturation », cf. cadrage « Devis ») — liste à
// plat toute la société, contrairement à FacturationController qui reste
// nested sous un projet. Ouverte aux rôles de direction selon la matrice
// (`finances_factures`, étape H5), comme le CRM depuis C2.
@Controller('societes/:slug/factures')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class FacturationCentraleController {
  constructor(
    private facturation: FacturationService,
    private controle: ControleInterneService,
    private parametres: ParametresFacturationService,
  ) {}

  @Get()
  @RequiertPermission('finances_factures', 'lecture')
  findAll(
    @Req() req: R,
    @Query('statut') statut?: FactureStatut,
    @Query('projetId') projetId?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.facturation.findAllPourSociete(req.user.societeId, { statut, projetId, clientId });
  }

  // Projets de la société (réf. courte) pour la section Facturation — sans
  // passer par les routes Projets, qui restent fermées aux rôles de direction.
  @Get('projets')
  @RequiertPermission('finances_factures', 'lecture')
  projets(@Req() req: R) {
    return this.facturation.projetsPourFacturation(req.user.societeId);
  }

  // Bureaux d'études à régler (client encaissé) — donnée de charges.
  @Get('bureaux-a-regler')
  @RequiertPermission('finances_charges', 'lecture')
  bureauxARegler(@Req() req: R) {
    return this.facturation.bureauxARegler(req.user.societeId);
  }

  // --- Paramètres de facturation (lot 6) : numérotation, profil imprimé ---
  // Lecture pour qui lit les factures ; le CFO seul modifie (vérifié par le service).
  @Get('parametres')
  @RequiertPermission(ETAPE.financesParametres, 'lecture')
  lireParametres(@Req() req: R) {
    return this.parametres.lire(req.user);
  }

  @Post('parametres/numerotation')
  @RequiertPermission(ETAPE.financesParametres, 'ecriture')
  numerotation(@Req() req: R, @Body() dto: FormatNumerotationDto) {
    return this.parametres.modifierFormat(req.user, dto);
  }

  // Coordonnées de paiement : mot de passe ou code exigé (service) ; tentatives
  // limitées pour qu'une session volée ne puisse pas deviner le mot de passe.
  @Post('parametres/profil')
  @RequiertPermission(ETAPE.financesParametres, 'ecriture')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  profil(@Req() req: R, @Body() dto: ProfilFacturationDto) {
    return this.parametres.modifierProfil(req.user, dto);
  }

  // --- Contrôle interne (revue CFO 20/10/2026) : avoirs, clôture mensuelle ---
  // Avoirs au-delà du seuil : le CEO décide (vérifié par le service).
  // Contresignature ou délégation du CEO : tranché par le service.
  @Get('avoirs/a-valider')
  @RequiertPermission(ETAPE.financesFactures, 'lecture')
  avoirsAValider(@Req() req: R) {
    return this.controle.avoirsAValider(req.user.societeId, req.user);
  }

  @Post('avoirs/:demandeId/decision')
  @RequiertPermission(ETAPE.financesFactures, 'lecture')
  deciderAvoir(@Req() req: R, @Param('demandeId', ParseUUIDPipe) demandeId: string, @Body() dto: DecisionAvoirDto) {
    return this.controle.deciderAvoir(req.user.societeId, demandeId, req.user, dto.valide, dto.motifRefus);
  }

  @Get('clotures')
  @RequiertPermission(ETAPE.financesCloture, 'lecture')
  clotures(@Req() req: R) {
    return this.controle.clotures(req.user.societeId);
  }

  // Clôturer : qui enregistre les paiements (CFO) ; rouvrir : le CEO seul.
  @Post('clotures/:mois')
  @RequiertPermission(ETAPE.financesCloture, 'validation')
  cloturer(@Req() req: R, @Param('mois') mois: string) {
    return this.controle.cloturer(req.user.societeId, mois, req.user);
  }

  @Post('clotures/:mois/reouverture')
  @RequiertPermission(ETAPE.financesCloture, 'suppression')
  rouvrir(@Req() req: R, @Param('mois') mois: string, @Body() dto: ReouvertureDto) {
    return this.controle.rouvrir(req.user.societeId, mois, req.user, dto.motif);
  }

  // --- Facture directe d'un lead (sans offre) — maquette Finances, oct. 2026 ---
  // Segments fixes, déclarés avant les routes ':id'.
  @Get('leads')
  @RequiertPermission('finances_factures', 'ecriture')
  leads(@Req() req: R) {
    return this.facturation.leadsFacturables(req.user.societeId);
  }

  // Préparée par qui a l'écriture ; « à valider par le CFO avant émission ».
  @Post('directes')
  @RequiertPermission('finances_factures', 'ecriture')
  creerDirecte(@Req() req: R, @Body() dto: CreerFactureDirecteDto) {
    return this.facturation.creerFactureDirecte(req.user.societeId, dto);
  }

  @Get(':id')
  @RequiertPermission('finances_factures', 'lecture')
  detail(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.facturation.factureCentrale(req.user.societeId, id);
  }

  // Validation par le CFO = émission (numéro, échéance).
  @Post(':id/emission')
  @RequiertPermission('finances_factures', 'validation')
  @ValidationCeoAuDelaDuSeuil('facture', 'id', { exclusif: true })
  emettre(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.facturation.emettreParId(req.user.societeId, id, req.user.userId);
  }

  @Delete(':id')
  @RequiertPermission(ETAPE.financesFactures, 'suppression')
  supprimer(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.facturation.supprimerParId(req.user.societeId, id);
  }

  @Post(':id/paiements')
  @RequiertPermission(ETAPE.financesEncaissements, 'validation')
  @ValidationCeoAuDelaDuSeuil('facture', 'id')
  paiement(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AjouterPaiementDto) {
    return this.facturation.ajouterPaiementParId(req.user.societeId, id, dto, req.user.userId);
  }

  @Post(':id/relance')
  @RequiertPermission('finances_factures', 'ecriture')
  relancer(@Req() req: R, @Param('id') id: string) {
    return this.facturation.relancer(req.user.societeId, id);
  }
}
