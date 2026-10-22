import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { CommissionsService } from './commissions.service';
import { CoordonneesApporteurDto, PayerCommissionDto } from './dto';
import type { Acteur } from './crm.service';

type Req = { user: Acteur & { societeId: string } };

// Commissions des apporteurs (revue COO, 22/10/2026) : qui voit, qui paie,
// qui saisit les coordonnées — tranché par le service (COO, CFO, CEO).
@Controller('societes/:slug/commissions')
@UseGuards(JwtAuthGuard, BackOfficeGuard)
export class CommissionsController {
  constructor(private commissions: CommissionsService) {}

  @Get()
  liste(@Req() req: Req) {
    return this.commissions.liste(req.user);
  }

  @Post(':id/paiement')
  @HttpCode(200)
  payer(@Req() req: Req, @Param('id') id: string, @Body() dto: PayerCommissionDto) {
    return this.commissions.payer(req.user, id, dto);
  }

  @Get('coordonnees/:dossierId')
  coordonnees(@Req() req: Req, @Param('dossierId') dossierId: string) {
    return this.commissions.lireCoordonnees(req.user, dossierId);
  }

  @Put('coordonnees/:dossierId')
  modifierCoordonnees(@Req() req: Req, @Param('dossierId') dossierId: string, @Body() dto: CoordonneesApporteurDto) {
    return this.commissions.modifierCoordonnees(req.user, dossierId, dto);
  }
}
