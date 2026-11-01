import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { CreerRendezVousDto, SemaineAgendaDto } from './agenda.dto';
import { AgendaService } from './agenda.service';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Agenda (lot 11, 01/11/2026) : tous les membres de la société, selon la matrice.
@Controller('societes/:slug/agenda')
@UseGuards(JwtAuthGuard, MembreSocieteGuard, PermissionGuard)
export class AgendaController {
  constructor(private agenda: AgendaService) {}

  // Du `du` au `au` (AAAA-MM-JJ, une semaine par défaut ; mois ou année) ;
  // `personne` : l'agenda d'un collègue.
  @Get()
  @RequiertPermission(ETAPE.agenda, 'lecture')
  semaine(
    @Req() req: R,
    @Query('du') du: string,
    @Query('au') au?: string,
    @Query('personne') personne?: string,
  ): Promise<SemaineAgendaDto> {
    return this.agenda.semaine(req.user, du, personne || undefined, au || undefined);
  }

  @Get('personnes')
  @RequiertPermission(ETAPE.agenda, 'lecture')
  personnes(@Req() req: R) {
    return this.agenda.personnes(req.user);
  }

  @Post()
  @RequiertPermission(ETAPE.agenda, 'ecriture')
  creer(@Req() req: R, @Body() dto: CreerRendezVousDto) {
    return this.agenda.creer(req.user, dto);
  }

  @Delete(':id')
  @RequiertPermission(ETAPE.agenda, 'suppression')
  annuler(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.agenda.annuler(req.user, id);
  }
}
