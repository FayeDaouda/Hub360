import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
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
}

// Le salarié : son temps calculé, en lecture seule.
@Controller('societes/:slug/mon-espace/temps')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MonTempsController {
  constructor(private temps: TempsService) {}

  @Get()
  monTemps(@Req() req: R, @Query() q: MoisQuery) {
    return this.temps.monTemps(req.user, q.mois);
  }
}
