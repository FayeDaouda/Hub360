import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { ContratsService } from './contrats.service';
import { AnnexeGabaritDto, FichierContratDto, MajAnnexeContratDto, ParametresContratDto } from './dto';

type R = { user: { societeId: string; userId: string } };

// Contrat d'un dossier CRM (étape G). Le contrat porte le prix de l'offre :
// même module que l'offre — `finances_devis` (le Dir. GC prépare ; le COO,
// sans accès aux montants, ne le voit pas).
@Controller('societes/:slug/dossiers/:id/contrat')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class ContratsController {
  constructor(private contrats: ContratsService) {}

  @Get()
  @RequiertPermission('finances_devis', 'lecture')
  get(@Req() req: R, @Param('id') id: string) {
    return this.contrats.get(req.user.societeId, id);
  }

  @Post()
  @RequiertPermission('finances_devis', 'ecriture')
  preparer(@Req() req: R, @Param('id') id: string) {
    return this.contrats.preparer(req.user.societeId, id);
  }

  @Post('generation')
  @RequiertPermission('finances_devis', 'ecriture')
  regenerer(@Req() req: R, @Param('id') id: string) {
    return this.contrats.regenerer(req.user.societeId, id);
  }

  @Post('document')
  @RequiertPermission('finances_devis', 'ecriture')
  deposerDocument(@Req() req: R, @Param('id') id: string, @Body() dto: FichierContratDto) {
    return this.contrats.deposerDocument(req.user.societeId, id, dto);
  }

  @Patch('annexes/:annexeId')
  @RequiertPermission('finances_devis', 'ecriture')
  majAnnexe(
    @Req() req: R,
    @Param('id') id: string,
    @Param('annexeId') annexeId: string,
    @Body() dto: MajAnnexeContratDto,
  ) {
    return this.contrats.majAnnexe(req.user.societeId, id, annexeId, dto.statut, dto.fichier);
  }

  @Post('envoi')
  @RequiertPermission('finances_devis', 'ecriture')
  envoyer(@Req() req: R, @Param('id') id: string) {
    return this.contrats.envoyer(req.user.societeId, id);
  }

  @Delete('envoi')
  @RequiertPermission('finances_devis', 'ecriture')
  retirerEnvoi(@Req() req: R, @Param('id') id: string) {
    return this.contrats.retirerEnvoi(req.user.societeId, id);
  }

  // Contrat papier signé et scanné — vaut signature (Onboard).
  @Post('signature-papier')
  @RequiertPermission('finances_devis', 'ecriture')
  signerPapier(@Req() req: R, @Param('id') id: string, @Body() dto: FichierContratDto) {
    return this.contrats.signerPapier(req.user.societeId, id, req.user.userId, dto);
  }
}

// Réglages société (Paramètres → Contrats) : modèle, signataire, seuil sur
// mesure, liste d'annexes — societe_admin ou CIO, comme les gabarits Foncier
// et Études (décision G).
@Controller('societes/:slug/parametres-contrat')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class ParametresContratController {
  constructor(private contrats: ContratsService) {}

  @Get()
  get(@Req() req: R) {
    return this.contrats.getParametres(req.user.societeId);
  }

  @Patch()
  maj(@Req() req: R, @Body() dto: ParametresContratDto) {
    return this.contrats.majParametres(req.user.societeId, dto);
  }

  @Post('annexes')
  ajouterAnnexe(@Req() req: R, @Body() dto: AnnexeGabaritDto) {
    return this.contrats.ajouterAnnexeGabarit(req.user.societeId, dto.libelle);
  }

  @Delete('annexes/:annexeId')
  retirerAnnexe(@Req() req: R, @Param('annexeId') annexeId: string) {
    return this.contrats.retirerAnnexeGabarit(req.user.societeId, annexeId);
  }
}
