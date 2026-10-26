import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { RemettreTacheDto } from '../projets/gabarit/dto';
import { TachesService } from './taches.service';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

class DecisionTacheDto {
  @IsIn(['valider', 'renvoyer']) decision: 'valider' | 'renvoyer';
  // Renvoi en reprise : motif obligatoire (mêmes règles que la page Projets).
  @ValidateIf((o) => o.decision === 'renvoyer') @IsString() @MinLength(3) @MaxLength(500) motif?: string;
}

type R = { user: { userId: string; societeId: string; role: string } };

// Le salarié : ses tâches (Mes performances) et leur remise.
@GroupScope()
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
  remettre(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('tacheId', ParseUUIDPipe) tacheId: string,
    @Body() dto: RemettreTacheDto,
  ) {
    return this.taches.remettre(req.user, projetId, tacheId, dto);
  }

  // Relancer son validateur : 3 jours ouvrés après le dépôt (puis après la
  // relance précédente) — le service vérifie l'assigné et le délai.
  @Post(':projetId/:tacheId/relance')
  relancer(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('tacheId', ParseUUIDPipe) tacheId: string,
  ) {
    return this.taches.relancer(req.user, projetId, tacheId);
  }
}

// Le valideur (chef de team, Architecte DPLG, admin) : le service vérifie
// qu'il l'est bien pour chaque tâche.
@GroupScope()
@Controller('societes/:slug/taches')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class ValidationsTachesController {
  constructor(private taches: TachesService) {}

  @Get('a-valider')
  aValider(@Req() req: R) {
    return this.taches.aValider(req.user);
  }

  // Fichier d'une remise : l'assigné ou son valideur (vérifié par le service).
  @Get(':projetId/:tacheId/pieces/:pieceId')
  piece(
    @Req() req: R,
    @Param('projetId', ParseUUIDPipe) projetId: string,
    @Param('tacheId', ParseUUIDPipe) tacheId: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
  ) {
    return this.taches.piece(req.user, projetId, tacheId, pieceId);
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
