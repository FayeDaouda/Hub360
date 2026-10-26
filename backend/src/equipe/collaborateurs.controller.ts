import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { CollaborateursService } from './collaborateurs.service';
import { MajCollaborateurDto } from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/collaborateurs')
// Module « équipe » de la matrice : lecture en GET, écriture sinon
// (Dir. GC écriture ; CEO, CTO, RH, Salarié lecture). La fiche d'équipe ne
// porte plus que cellule, niveau et photo : l'identité vit dans le dossier RH
// et la création passe par l'Administration du HUB (phase 1, 14/10/2026).
@PermissionSelonMethode('equipe')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class CollaborateursController {
  constructor(private collaborateurs: CollaborateursService) {}

  // `?cellule=A` (une équipe) ou `?cellule=A&cellule=B` (plusieurs — Nest
  // renvoie alors un tableau) : cf. CollaborateursService.findAll.
  @Get()
  findAll(@Req() req: R, @Query('q') q?: string, @Query('cellule') cellule?: string | string[]) {
    return this.collaborateurs.findAll(req.user.societeId, q, cellule);
  }

  @Patch(':id')
  maj(@Req() req: R, @Param('id') id: string, @Body() dto: MajCollaborateurDto) {
    return this.collaborateurs.maj(req.user.societeId, id, dto);
  }
}
