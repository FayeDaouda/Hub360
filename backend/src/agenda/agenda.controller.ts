import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { PermissionGuard } from '../commun/permission.guard';
import { AbonnementAgendaService } from './abonnement.service';
import {
  CreerRendezVousDto,
  EtatAbonnementAgendaDto,
  LienAbonnementAgendaDto,
  ModifierRendezVousDto,
  SemaineAgendaDto,
} from './agenda.dto';
import { AgendaService } from './agenda.service';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Agenda (lot 11, 01/11/2026) : tous les membres de la société, selon la matrice.
@Controller('societes/:slug/agenda')
@UseGuards(JwtAuthGuard, MembreSocieteGuard, PermissionGuard)
export class AgendaController {
  constructor(
    private agenda: AgendaService,
    private abonnements: AbonnementAgendaService,
  ) {}

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

  // Abonnement depuis Google, Apple ou Outlook : son propre agenda, avec la
  // Lecture de « Mon agenda » (revérifiée à chaque relecture du lien).
  @Get('abonnement')
  @RequiertPermission(ETAPE.agenda, 'lecture')
  etatAbonnement(@Req() req: R): Promise<EtatAbonnementAgendaDto> {
    return this.abonnements.etat(req.user);
  }

  // Crée le lien, ou le remplace (l'ancien cesse de fonctionner).
  @Post('abonnement')
  @RequiertPermission(ETAPE.agenda, 'lecture')
  creerAbonnement(@Req() req: R): Promise<LienAbonnementAgendaDto> {
    return this.abonnements.creer(req.user);
  }

  @Delete('abonnement')
  @RequiertPermission(ETAPE.agenda, 'lecture')
  supprimerAbonnement(@Req() req: R) {
    return this.abonnements.supprimer(req.user);
  }

  @Post()
  @RequiertPermission(ETAPE.agenda, 'ecriture')
  creer(@Req() req: R, @Body() dto: CreerRendezVousDto) {
    return this.agenda.creer(req.user, dto);
  }

  // Modifier un rendez-vous (12/11/2026) : l'organisateur seul. Débit
  // limité : chaque modification peut écrire aux invités.
  @Patch(':id')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequiertPermission(ETAPE.agenda, 'ecriture')
  modifier(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModifierRendezVousDto) {
    return this.agenda.modifier(req.user, id, dto);
  }

  @Delete(':id')
  @RequiertPermission(ETAPE.agenda, 'suppression')
  annuler(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.agenda.annuler(req.user, id);
  }
}
