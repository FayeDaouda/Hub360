import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DevisService } from './devis.service';
import { DevisPublicGuard } from './devis-public.guard';
import { ReponseDevisDto } from './dto';

// Contrôleur SANS authentification — comme AuthController, seul à porter le
// rate-limiting (défense en profondeur : le jeton à 256 bits d'aléa rend le
// brute-force déjà impraticable, cf. auth/jetons.ts). Consultation répétée
// autorisée (le client rouvre son lien) ; répondre reste borné plus bas.
@Controller('devis-public')
@UseGuards(ThrottlerGuard, DevisPublicGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class DevisPublicController {
  constructor(private devis: DevisService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.devis.getPublic(token);
  }

  @Post(':token/reponse')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  repondre(@Param('token') token: string, @Body() dto: ReponseDevisDto) {
    return this.devis.repondrePublic(token, dto.reponse);
  }
}
