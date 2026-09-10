import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { CollaborateursService } from './collaborateurs.service';

type R = { user: { societeId: string; userId: string } };

// Ouvert à tout membre de la société (garde « membre », pas « admin ») :
// chaque collaborateur lit SA fiche, jamais celle d'un autre — l'id vient du
// token, pas de l'URL.
@Controller('societes/:slug/mon-profil')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MonProfilController {
  constructor(private collaborateurs: CollaborateursService) {}

  @Get()
  lire(@Req() req: R) {
    return this.collaborateurs.monProfil(req.user.societeId, req.user.userId);
  }
}
