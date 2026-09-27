import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StatutDevis } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { DevisService } from './devis.service';
import { CreerDevisDto, PatchDevisDto, ReponseDevisDto } from './dto';

type R = { user: { societeId: string; userId: string } };

// Centralisé : pas de :projetId dans la route, projetId est nullable côté
// modèle (devis « libre » possible). Ouvert aux rôles de direction selon la
// matrice (étape F — le Dir. GC prépare l'offre d'un dossier) : lecture pour
// consulter, écriture pour préparer / relancer / saisir une réponse,
// validation pour ENVOYER un devis libre (une offre CRM, elle, part par la
// validation DAF du dossier, cf. CrmService).
@Controller('societes/:slug/devis')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class DevisController {
  constructor(private devis: DevisService) {}

  @Get()
  @RequiertPermission('finances_devis', 'lecture')
  findAll(
    @Req() req: R,
    @Query('statut') statut?: StatutDevis,
    @Query('projetId') projetId?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.devis.findAll(req.user.societeId, { statut, projetId, clientId });
  }

  @Get(':id')
  @RequiertPermission('finances_devis', 'lecture')
  get(@Req() req: R, @Param('id') id: string) {
    return this.devis.get(req.user.societeId, id);
  }

  @Post()
  @RequiertPermission('finances_devis', 'ecriture')
  creer(@Req() req: R, @Body() dto: CreerDevisDto) {
    return this.devis.creer(req.user.societeId, dto);
  }

  @Patch(':id')
  @RequiertPermission('finances_devis', 'ecriture')
  patch(@Req() req: R, @Param('id') id: string, @Body() dto: PatchDevisDto) {
    return this.devis.patch(req.user.societeId, id, dto);
  }

  @Delete(':id')
  @RequiertPermission('finances_devis', 'ecriture')
  @HttpCode(204)
  supprimer(@Req() req: R, @Param('id') id: string) {
    return this.devis.supprimer(req.user.societeId, id);
  }

  @Post(':id/envoi')
  @RequiertPermission('finances_devis', 'validation')
  envoyer(@Req() req: R, @Param('id') id: string) {
    return this.devis.envoyer(req.user.societeId, id);
  }

  @Post(':id/reponse')
  @RequiertPermission('finances_devis', 'ecriture')
  marquerReponse(@Req() req: R, @Param('id') id: string, @Body() dto: ReponseDevisDto) {
    return this.devis.marquerReponse(req.user.societeId, id, dto.reponse, req.user.userId);
  }

  @Post(':id/relance')
  @RequiertPermission('finances_devis', 'ecriture')
  relancer(@Req() req: R, @Param('id') id: string) {
    return this.devis.relancer(req.user.societeId, id);
  }

  // Crée une facture : droit sur les factures, pas seulement sur les devis.
  @Post(':id/conversion')
  @RequiertPermission('finances_factures', 'ecriture')
  convertir(@Req() req: R, @Param('id') id: string) {
    return this.devis.convertir(req.user.societeId, id);
  }
}
