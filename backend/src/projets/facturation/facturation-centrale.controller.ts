import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FactureStatut } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { FacturationService } from './facturation.service';

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

  @Post(':id/relance')
  @RequiertPermission('finances_factures', 'ecriture')
  relancer(@Req() req: R, @Param('id') id: string) {
    return this.facturation.relancer(req.user.societeId, id);
  }
}
