import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { TempsService } from './temps.service';

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

class MoisQuery {
  @IsOptional() @Matches(MOIS) mois?: string;
}

class DureeDto {
  // null retire la durée (le bloc ne produit plus d'heures).
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(9999)
  heures: number | null;
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

// Référentiel des durées standard : configuration société (admin ou CIO),
// comme les gabarits de checklist — pas un module métier de la matrice.
@Controller('societes/:slug/durees-standard')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class DureesStandardController {
  constructor(private temps: TempsService) {}

  @Get()
  lister(@Req() req: R) {
    return this.temps.durees(req.user.societeId);
  }

  @Put(':section/:groupe')
  definir(@Req() req: R, @Param('section') section: string, @Param('groupe') groupe: string, @Body() dto: DureeDto) {
    return this.temps.definirDuree(req.user.societeId, req.user.userId, section, groupe, dto.heures);
  }
}
