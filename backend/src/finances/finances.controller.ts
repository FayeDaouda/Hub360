import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { FeuilleTempsService } from './feuille-temps.service';
import { SeuilCeoService } from './seuil-ceo.service';

type R = { user: { societeId: string } };

// Finances · vues de rentabilité (maquette du boss, oct. 2026) : réservées à
// qui lit les marges (CFO, CEO, CTO, CIO), comme le tableau de bord.
@Controller('societes/:slug/finances')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class FinancesController {
  constructor(
    private feuilleTemps: FeuilleTempsService,
    private seuilCeo: SeuilCeoService,
  ) {}

  // Seuil de contresignature (TTC) : l'écran n'offre au CEO la validation
  // que des affaires au-delà — le serveur revérifie (SeuilCeoGuard).
  @Get('seuil-contresignature')
  @RequiertPermission('finances_devis', 'lecture')
  async seuilContresignature(@Req() req: R) {
    return { seuilTtc: await this.seuilCeo.seuil(req.user.societeId) };
  }

  @Get('feuille-temps/:dossierId')
  @RequiertPermission('finances_marges', 'lecture')
  feuilleDeTemps(@Req() req: R, @Param('dossierId', ParseUUIDPipe) dossierId: string) {
    return this.feuilleTemps.pourDossier(req.user.societeId, dossierId);
  }
}
