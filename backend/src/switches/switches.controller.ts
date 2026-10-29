import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HubAdminGuard } from '../commun/hub-admin.guard';
import { InterrupteurModuleDto, InterrupteursDto, MaintenanceDto } from './switches.dto';
import { SwitchesService } from './switches.service';

type R = { user: { userId: string; societeId: string } };

// Administration du HUB › Interrupteurs (Administrateur HUB).
@Controller('societes/:slug/interrupteurs')
@UseGuards(JwtAuthGuard, HubAdminGuard)
export class SwitchesController {
  constructor(private switches: SwitchesService) {}

  @Get()
  state(@Req() req: R): Promise<InterrupteursDto> {
    return this.switches.state(req.user.societeId);
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
