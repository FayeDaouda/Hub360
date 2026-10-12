import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FactureStatut } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ValidationCeoAuDelaDuSeuil } from '../../finances/seuil-ceo.guard';
import { FacturationService } from './facturation.service';
import { AjouterPaiementDto, CreerFactureDirecteDto } from './dto';

type R = { user: { societeId: string } };

// Vue centralisée (page « Facturation », cf. cadrage « Devis ») — liste à
// plat toute la société, contrairement à FacturationController qui reste
// nested sous un projet. Ouverte aux rôles de direction selon la matrice
// (`finances_factures`, étape H5), comme le CRM depuis C2.
@Controller('societes/:slug/factures')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class FacturationCentraleController {
  constructor(private facturation: FacturationService) {}

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
  @ValidationCeoAuDelaDuSeuil('facture', 'id')
  emettre(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.facturation.emettreParId(req.user.societeId, id);
  }

  @Delete(':id')
  @RequiertPermission('finances_factures', 'ecriture')
  supprimer(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.facturation.supprimerParId(req.user.societeId, id);
  }

  @Post(':id/paiements')
  @RequiertPermission('finances_factures', 'validation')
  @ValidationCeoAuDelaDuSeuil('facture', 'id')
  paiement(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AjouterPaiementDto) {
    return this.facturation.ajouterPaiementParId(req.user.societeId, id, dto);
  }

  @Post(':id/relance')
  @RequiertPermission('finances_factures', 'ecriture')
  relancer(@Req() req: R, @Param('id') id: string) {
    return this.facturation.relancer(req.user.societeId, id);
  }
}
