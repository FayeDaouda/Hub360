import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppelPublicGuard } from './appel-public.guard';
import { AppelsService } from './appels.service';
import { CandidaterDto } from './recrutement.dto';

// Contrôleur SANS authentification (appel à candidatures, 01/11/2026) : la
// page d'un appel, la page Carrières d'une société, le dépôt d'une
// candidature. Limité par adresse IP, comme le lien public du devis ; le
// dépôt l'est davantage (pièces lourdes, robots).
@Controller('recrutement-public')
@UseGuards(ThrottlerGuard, AppelPublicGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class CandidaturePublicController {
  constructor(private appels: AppelsService) {}

  @Get('appels/:slug')
  appel(@Param('slug') slug: string) {
    return this.appels.publicAppel(slug);
  }

  @Post('appels/:slug/candidatures')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  candidater(@Param('slug') slug: string, @Body() dto: CandidaterDto) {
    return this.appels.candidater(slug, dto);
  }

  @Get('carrieres/:societe')
  carrieres(@Param('societe') societe: string) {
    return this.appels.carrieres(societe);
  }
}
