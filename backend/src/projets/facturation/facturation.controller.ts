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
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { FacturationService } from './facturation.service';
import {
  AjouterPaiementDto,
  CreerEcheancierDto,
  CreerMensualiteDto,
  RefacturerEtudesDto,
  CreerFactureDto,
  PatchFactureDto,
} from './dto';

type R = { user: { societeId: string; userId: string } };

// Gouverné par la matrice, module `finances_factures` (étape H5) — chaque route
// porte son niveau ; AccesProjetGuard laisse passer un rôle de direction
// seulement sur une route marquée, PermissionGuard tranche ensuite :
//   · lecture    : consulter (un collaborateur, sans ligne dans la matrice,
//                  ne voit plus aucun montant — cf. étape I) ;
//   · écriture   : préparer — brouillons, échéancier, mensualités (Dir. GC) ;
//   · validation : émettre, faire un avoir, enregistrer / supprimer un
//                  paiement — « la CFO seule enregistre les paiements, ça
//                  fait foi » (décision H, 27/09/2026). societe_admin et CEO
//                  ont aussi `validation` dans la matrice.
@Controller('societes/:slug/projets/:id/factures')
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class FacturationController {
  constructor(private facturation: FacturationService) {}

  @Get()
  @RequiertPermission('finances_factures', 'lecture')
  get(@Req() req: R, @Param('id') id: string) {
    return this.facturation.get(req.user.societeId, id);
  }

  @Post()
  @RequiertPermission('finances_factures', 'ecriture')
  creer(@Req() req: R, @Param('id') id: string, @Body() dto: CreerFactureDto) {
    return this.facturation.creer(req.user.societeId, id, dto);
  }

  @Post('echeancier')
  @RequiertPermission('finances_factures', 'ecriture')
  creerEcheancier(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: CreerEcheancierDto,
  ) {
    return this.facturation.creerEcheancier(req.user.societeId, id, dto);
  }

  @Patch(':factureId')
  @RequiertPermission('finances_factures', 'ecriture')
  patch(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: PatchFactureDto,
  ) {
    return this.facturation.patch(req.user.societeId, id, factureId, dto);
  }

  // Facture de la mensualité du mois pour une ligne SU / EX de l'offre.
  @Post('mensualites')
  @RequiertPermission('finances_factures', 'ecriture')
  creerMensualite(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: CreerMensualiteDto,
  ) {
    return this.facturation.creerMensualite(req.user.societeId, id, dto.ligneDevisId);
  }

  // Refacturation des études techniques : écriture sur les factures.
  @Post('refacturation-etudes')
  @RequiertPermission('finances_factures', 'ecriture')
  refacturerEtudes(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: RefacturerEtudesDto,
  ) {
    return this.facturation.refacturerEtudes(req.user.societeId, id, dto.blocIds);
  }

  // Règlement du bureau d'études — une charge : finances_charges (CFO), pas
  // finances_factures (décision H3).
  @Post('etudes/:blocId/reglement')
  @RequiertPermission('finances_charges', 'validation')
  marquerBureauRegle(
    @Req() req: R,
    @Param('id') id: string,
    @Param('blocId') blocId: string,
  ) {
    return this.facturation.marquerBureauRegle(req.user.societeId, id, blocId, req.user.userId);
  }

  @Post(':factureId/emission')
  @RequiertPermission('finances_factures', 'validation')
  emettre(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.emettre(req.user.societeId, id, factureId);
  }

  @Delete(':factureId')
  @RequiertPermission('finances_factures', 'ecriture')
  supprimer(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.supprimer(req.user.societeId, id, factureId);
  }

  @Post(':factureId/avoir')
  @RequiertPermission('finances_factures', 'validation')
  creerAvoir(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.creerAvoir(req.user.societeId, id, factureId);
  }

  @Post(':factureId/paiements')
  @RequiertPermission('finances_factures', 'validation')
  ajouterPaiement(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: AjouterPaiementDto,
  ) {
    return this.facturation.ajouterPaiement(req.user.societeId, id, factureId, dto);
  }

  @Delete(':factureId/paiements/:paiementId')
  @RequiertPermission('finances_factures', 'validation')
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
