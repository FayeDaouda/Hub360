import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { TachesService } from './taches.service';

class DecisionTacheDto {
  @IsIn(['valider', 'renvoyer']) decision: 'valider' | 'renvoyer';
  // Renvoi en reprise : motif obligatoire (mêmes règles que la page Projets).
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

type R = { user: { userId: string; societeId: string; role: string } };

// Le salarié : ses tâches (Mes performances) et leur remise.
@Controller('societes/:slug/mon-espace/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MesTachesController {
  constructor(private taches: TachesService) {}

  @Get()
  lister(@Req() req: R) {
    return this.taches.mesTaches(req.user);
  }

  // Tâche du gabarit : le service vérifie que la personne connectée en est l'assignée.
  @Post(':projetId/:tacheId/remise')
  remettre(@Req() req: R, @Param('projetId', ParseUUIDPipe) projetId: string, @Param('tacheId', ParseUUIDPipe) tacheId: string) {
    return this.taches.remettre(req.user, projetId, tacheId);
  }
}

// Le valideur (chef de team, Architecte DPLG, admin) : le service vérifie
// qu'il l'est bien pour chaque tâche.
@Controller('societes/:slug/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class ValidationsTachesController {
  constructor(private taches: TachesService) {}

  @Get('a-valider')
  aValider(@Req() req: R) {
    return this.taches.aValider(req.user);
  }

  @Post(':projetId/:tacheId/decision')
  decider(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('tacheId', ParseUUIDPipe) tacheId: string,
    @Body() dto: DecisionTacheDto,
  ) {
    return this.taches.decider(req.user, projetId, tacheId, dto);
  }
}
