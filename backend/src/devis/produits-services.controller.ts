import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { SocieteAccesGuard } from '../commun/societe-acces.guard';
import { ProduitsServicesService } from './produits-services.service';
import { CreerProduitServiceDto, PatchProduitServiceDto } from './produits-services.dto';

type R = { user: { societeId: string } };

// Lecture : quiconque prépare des devis (liste de choix des lignes, étape F).
// Gestion du catalogue : administration de la société seule, inchangé.
@Controller('societes/:slug/produits-services')
@UseGuards(JwtAuthGuard)
export class ProduitsServicesController {
  constructor(private produits: ProduitsServicesService) {}

  @Get()
  @UseGuards(BackOfficeGuard, PermissionGuard)
  @RequiertPermission('finances_devis', 'lecture')
  findAll(@Req() req: R) {
    return this.produits.findAll(req.user.societeId);
  }

  @Post()
  @UseGuards(SocieteAccesGuard)
  creer(@Req() req: R, @Body() dto: CreerProduitServiceDto) {
    return this.produits.creer(req.user.societeId, dto);
  }

  @Patch(':id')
  @UseGuards(SocieteAccesGuard)
  patch(@Req() req: R, @Param('id') id: string, @Body() dto: PatchProduitServiceDto) {
    return this.produits.patch(req.user.societeId, id, dto);
  }

  @Delete(':id')
  @UseGuards(SocieteAccesGuard)
  @HttpCode(204)
  supprimer(@Req() req: R, @Param('id') id: string) {
    return this.produits.supprimer(req.user.societeId, id);
  }
}
