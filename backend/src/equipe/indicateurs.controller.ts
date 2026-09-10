import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesIndicateursGuard } from './acces-indicateurs.guard';
import { CollaborateursService } from './collaborateurs.service';

type R = { user: { societeId: string } };

// Séparé de CollaborateursController (réservé à l'admin) : les indicateurs sont
// aussi lisibles par le collaborateur concerné — cf. AccesIndicateursGuard.
@Controller('societes/:slug/collaborateurs/:id/indicateurs')
@UseGuards(JwtAuthGuard, AccesIndicateursGuard)
export class IndicateursController {
  constructor(private collaborateurs: CollaborateursService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.collaborateurs.indicateurs(req.user.societeId, id);
  }
}
