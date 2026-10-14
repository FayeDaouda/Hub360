import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { type Acteur, RechercheService } from './recherche.service';

// Recherche globale — le service filtre lui-même chaque type selon la matrice
// (lecture requise), d'où l'absence de @RequiertPermission sur la route.
@Controller('societes/:slug/recherche')
@UseGuards(JwtAuthGuard, BackOfficeGuard)
export class RechercheController {
  constructor(private recherche: RechercheService) {}

  @Get()
  chercher(@Req() req: { user: Acteur }, @Query('q') q = '') {
    return this.recherche.chercher(req.user, String(q).slice(0, 80));
  }
}
