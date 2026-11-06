import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HubAdminGuard } from '../commun/hub-admin.guard';
import { CatalogueModulesDto, InterrupteurModuleDto, InterrupteursDto, MaintenanceDto } from './switches.dto';
import { CATALOGUE_MODULES } from './catalogue-modules';
import { SwitchesService } from './switches.service';

type R = { user: { userId: string; societeId: string } };

// Administration du HUB › Interrupteurs et Modules (CIO, Administrateur HUB).
@Controller('societes/:slug/interrupteurs')
@UseGuards(JwtAuthGuard, HubAdminGuard)
export class SwitchesController {
  constructor(private switches: SwitchesService) {}

  @Get()
  state(@Req() req: R): Promise<InterrupteursDto> {
    return this.switches.state(req.user.societeId);
  }

  // Écran « Modules » (lot 10, 31/10/2026) : le catalogue du HUB, chaque
  // module avec son statut et, s'il existe, son état dans la société.
  @Get('catalogue')
  async catalogue(@Req() req: R): Promise<CatalogueModulesDto> {
    const etat = await this.switches.state(req.user.societeId);
    const actif = new Map(etat.modules.map((m) => [m.cle, m.actif]));
    return {
      familles: CATALOGUE_MODULES.map((f) => ({
        nom: f.nom,
        modules: f.modules.map((m) => ({
          nom: m.nom,
          statut: m.statut,
          note: m.note ?? null,
          module: m.module && actif.has(m.module) ? { cle: m.module, actif: actif.get(m.module)! } : null,
        })),
      })),
    };
  }

  @Put('modules/:cle')
  setModule(@Req() req: R, @Param('cle') cle: string, @Body() dto: InterrupteurModuleDto): Promise<InterrupteursDto> {
    return this.switches.setModule(req.user.societeId, cle, dto.actif, dto.motif.trim(), req.user.userId);
  }

  @Put('maintenance')
  setMaintenance(@Req() req: R, @Body() dto: MaintenanceDto): Promise<InterrupteursDto> {
    return this.switches.setMaintenance(
      req.user.societeId,
      dto.actif,
      dto.message.trim(),
      dto.motif.trim(),
      req.user.userId,
    );
  }
}
