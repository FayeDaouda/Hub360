import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { SectionTache } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { TachesService } from './taches.service';

class DecisionTacheDto {
  @IsIn(['valider', 'renvoyer']) decision: 'valider' | 'renvoyer';
  @IsOptional() @IsString() @MaxLength(1000) motif?: string;
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

  @Post(':section/:projetId/:groupe/remise')
  remettre(
    @Req() req: R,
    @Param('section', new ParseEnumPipe(SectionTache)) section: SectionTache,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('groupe') groupe: string,
  ) {
    return this.taches.remettre(req.user, { section, projetId, groupe });
  }
}

// Le N+1 (chef de cellule, Dir. GC, admin) : le service vérifie qu'il l'est
// bien pour chaque tâche.
@Controller('societes/:slug/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class ValidationsTachesController {
  constructor(private taches: TachesService) {}

  @Get('a-valider')
  aValider(@Req() req: R) {
    return this.taches.aValider(req.user);
  }

  @Post(':section/:projetId/:groupe/decision')
  decider(
    @Req() req: R,
    @Param('section', new ParseEnumPipe(SectionTache)) section: SectionTache,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('groupe') groupe: string,
    @Body() dto: DecisionTacheDto,
  ) {
    return this.taches.decider(req.user, { section, projetId, groupe }, dto);
  }
}
