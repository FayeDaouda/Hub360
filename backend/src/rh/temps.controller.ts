import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { TempsService } from './temps.service';

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

class MoisQuery {
  @IsOptional() @Matches(MOIS) mois?: string;
}

class SignalerEcartDto {
  @Matches(MOIS) mois!: string;
  @IsString() @MinLength(5) @MaxLength(1000) commentaire!: string;
}

class TraiterEcartDto {
  @IsString() @MinLength(3) @MaxLength(1000) reponse!: string;
}

type R = { user: { userId: string; societeId: string } };

// RH · Feuilles de temps (lot 4). Module « rh » : lecture CFO/CEO, contrôle RH.
@Controller('societes/:slug/rh/feuilles-temps')
@PermissionSelonMethode('rh')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class FeuillesTempsController {
  constructor(private temps: TempsService) {}

  @Get()
  lister(@Query() q: MoisQuery) {
    return this.temps.feuilles(q.mois);
  }

  @Post(':dossierId/:mois/controle')
  controler(@Req() req: R, @Param('dossierId', ParseUUIDPipe) dossierId: string, @Param('mois') mois: string) {
    return this.temps.controler(req.user.userId, dossierId, mois);
  }

  // Réponse à un écart signalé par le salarié (écriture RH).
  @Post('ecarts/:ecartId/traitement')
  traiterEcart(@Req() req: R, @Param('ecartId', ParseUUIDPipe) ecartId: string, @Body() dto: TraiterEcartDto) {
    return this.temps.traiterEcart(req.user.userId, ecartId, dto.reponse);
  }
}

// Le salarié : son temps calculé, en lecture seule ; il peut signaler un écart.
@Controller('societes/:slug/mon-espace/temps')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MonTempsController {
  constructor(private temps: TempsService) {}

  @Get()
  monTemps(@Req() req: R, @Query() q: MoisQuery) {
    return this.temps.monTemps(req.user, q.mois);
  }

  @Post('ecarts')
  signalerEcart(@Req() req: R, @Body() dto: SignalerEcartDto) {
    return this.temps.signalerEcart(req.user, dto.mois, dto.commentaire);
  }
}
