import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ETAPE } from '@hub/domain';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../../commun/membre-societe.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { PermissionGuard } from '../../commun/permission.guard';
import { ConnexionsAgendaService } from './connexions.service';
import { ChoisirAgendasDto, DebutConnexionDto, EtatConnexionsDto } from './synchro.dto';

type R = { user: { userId: string; societeId: string; role: string; permissions: Record<string, string> } };

// Agendas connectés de la personne (16/11/2026) : les siens seulement, avec
// la Lecture de « Mon agenda ».
@Controller('societes/:slug/agenda/connexions')
@UseGuards(JwtAuthGuard, MembreSocieteGuard, PermissionGuard)
@RequiertPermission(ETAPE.agenda, 'lecture')
export class ConnexionsAgendaController {
  constructor(private connexions: ConnexionsAgendaService) {}

  @Get()
  etat(@Req() req: R): Promise<EtatConnexionsDto> {
    return this.connexions.etat(req.user);
  }

  // L'adresse où autoriser l'accès chez Google.
  @Post('google')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  debutGoogle(@Req() req: R): Promise<DebutConnexionDto> {
    return this.connexions.debutGoogle(req.user);
  }

  @Put(':id')
  choisir(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChoisirAgendasDto,
  ): Promise<EtatConnexionsDto> {
    return this.connexions.choisirAgendas(req.user, id, dto.importes, dto.cible ?? null);
  }

  @Post(':id/synchroniser')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  synchroniser(@Req() req: R, @Param('id', ParseUUIDPipe) id: string): Promise<EtatConnexionsDto> {
    return this.connexions.synchroniserMaintenant(req.user, id);
  }

  @Delete(':id')
  deconnecter(@Req() req: R, @Param('id', ParseUUIDPipe) id: string): Promise<EtatConnexionsDto> {
    return this.connexions.deconnecter(req.user, id);
  }
}

// Retour de Google après l'autorisation (16/11/2026) — SANS session : le
// navigateur revient de Google ; c'est l'état (256 bits d'aléa, à usage
// unique, dix minutes) qui désigne la personne. Renvoie à l'Agenda.
@Controller('agenda/google')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class RetourGoogleController {
  constructor(private connexions: ConnexionsAgendaService) {}

  @Get('retour')
  @Redirect()
  async retour(@Query('state') etat?: string, @Query('code') code?: string, @Query('error') erreur?: string) {
    return { url: await this.connexions.retourGoogle(etat, code, erreur), statusCode: 302 };
  }
}
