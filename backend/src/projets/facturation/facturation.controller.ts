import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { ValidationCeoAuDelaDuSeuil } from '../../finances/seuil-ceo.guard';
import { FacturationService } from './facturation.service';
import {
  AjouterPaiementDto,
  CreerEcheancierDto,
  FactureBureauDto,
  CreerMensualiteDto,
  RefacturerEtudesDto,
  CreerFactureDto,
  PatchFactureDto,
  SupprimerPaiementDto,
  DemandeAvoirDto,
} from './dto';
import { ControleInterneService } from './controle-interne.service';

type R = { user: { societeId: string; userId: string; role: string } };

// Gouverné par la matrice, module `finances_factures` (étape H5) — chaque route
// porte son niveau ; AccesProjetGuard laisse passer un rôle de direction
// seulement sur une route marquée, PermissionGuard tranche ensuite :
//   · lecture    : consulter (un collaborateur, sans ligne dans la matrice,
//                  ne voit plus aucun montant — cf. étape I) ;
//   · écriture   : préparer — brouillons, échéancier, mensualités (Dir. GC) ;
//   · validation : émettre, faire un avoir, enregistrer / supprimer un
//                  paiement — « la CFO seule enregistre les paiements, ça
//                  fait foi » (décision H, 27/09/2026). societe_admin et CEO
//                  ont aussi `validation` dans la matrice — le CEO seulement
//                  au-delà du seuil de contresignature (finances/seuil-ceo).
@Controller('societes/:slug/projets/:id/factures')
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class FacturationController {
  constructor(
    private facturation: FacturationService,
    private controle: ControleInterneService,
  ) {}

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

  // Facture du bureau d'études d'une étude de l'étape 05 : écriture sur les
  // factures (même règle que la refacturation qui en découle).
  @Put('etudes/cartes/:carteId/bureau')
  @RequiertPermission('finances_factures', 'ecriture')
  saisirFactureBureau(
    @Req() req: R,
    @Param('id') id: string,
    @Param('carteId') carteId: string,
    @Body() dto: FactureBureauDto,
  ) {
    return this.facturation.saisirFactureBureau(req.user.societeId, id, carteId, dto);
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
  @ValidationCeoAuDelaDuSeuil('facture', 'factureId', { exclusif: true })
  emettre(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
  ) {
    return this.facturation.emettre(req.user.societeId, id, factureId, req.user.userId);
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
  @ValidationCeoAuDelaDuSeuil('facture', 'factureId')
  // Motif obligatoire ; au-delà du seuil, en attente du CEO (contrôle interne).
  async creerAvoir(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: DemandeAvoirDto,
  ) {
    await this.controle.demanderAvoir(req.user.societeId, id, factureId, dto, req.user);
    return this.facturation.get(req.user.societeId, id);
  }

  @Post(':factureId/paiements')
  @RequiertPermission('finances_factures', 'validation')
  @ValidationCeoAuDelaDuSeuil('facture', 'factureId')
  ajouterPaiement(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Body() dto: AjouterPaiementDto,
  ) {
    return this.facturation.ajouterPaiement(req.user.societeId, id, factureId, dto, req.user.userId);
  }

  @Delete(':factureId/paiements/:paiementId')
  @RequiertPermission('finances_factures', 'validation')
  @ValidationCeoAuDelaDuSeuil('facture', 'factureId')
  supprimerPaiement(
    @Req() req: R,
    @Param('id') id: string,
    @Param('factureId') factureId: string,
    @Param('paiementId') paiementId: string,
    @Body() dto: SupprimerPaiementDto,
  ) {
    return this.facturation.supprimerPaiement(
      req.user.societeId,
      id,
      factureId,
      paiementId,
      req.user.userId,
      dto.motif,
    );
  }
}
