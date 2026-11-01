import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { CreerAnnonceDto, VueAnnoncesDto } from './annonces.dto';
import { AnnoncesService } from './annonces.service';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Annonces (lot 12, 01/11/2026) : tous les membres, selon la matrice.
@Controller('societes/:slug/annonces')
@UseGuards(JwtAuthGuard, MembreSocieteGuard, PermissionGuard)
export class AnnoncesController {
  constructor(private annonces: AnnoncesService) {}

  @Get()
  @RequiertPermission(ETAPE.annonces, 'lecture')
  vue(@Req() req: R): Promise<VueAnnoncesDto> {
    return this.annonces.vue(req.user);
  }

  @Post()
  @RequiertPermission(ETAPE.annonces, 'ecriture')
  creer(@Req() req: R, @Body() dto: CreerAnnonceDto) {
    return this.annonces.creer(req.user, dto);
  }

  @Post(':id/validation')
  @HttpCode(200)
  @RequiertPermission(ETAPE.annonces, 'validation')
  valider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.annonces.valider(req.user, id);
  }

  @Post(':id/retrait')
  @HttpCode(200)
  @RequiertPermission(ETAPE.annonces, 'suppression')
  retirer(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.annonces.retirer(req.user, id);
  }

  @Post(':id/lecture')
  @HttpCode(200)
  @RequiertPermission(ETAPE.annonces, 'lecture')
  lire(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.annonces.lire(req.user, id);
  }
}
