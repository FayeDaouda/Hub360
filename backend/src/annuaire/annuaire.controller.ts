import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { HubAdminGuard } from '../commun/hub-admin.guard';
import { AnnuaireDto, PerimetreAnnuaireDto, ReglerPerimetreDto } from './annuaire.dto';
import { AnnuaireService } from './annuaire.service';

type R = { user: { userId: string; societeId: string; permissions?: Record<string, string> } };

// Annuaire (22/11/2026) : ouvert à tout compte du back-office, hors matrice
// (comme la fiche contact et la recherche) — le service ne renvoie que les
// champs d'annuaire, dans le périmètre réglé pour la société. (« annuaire »
// seul est la liste des conversations de la messagerie.)
@Controller('societes/:slug/annuaire/collegues')
@UseGuards(JwtAuthGuard, BackOfficeGuard)
export class AnnuaireController {
  constructor(private annuaire: AnnuaireService) {}

  @Get()
  lister(@Req() req: R): Promise<AnnuaireDto> {
    return this.annuaire.lister(req.user);
  }
}

// Administration du HUB › Annuaire : le périmètre, réglé par le CIO et
// l'Administrateur HUB, pour la société de connexion.
@Controller('societes/:slug/annuaire/perimetre')
@UseGuards(JwtAuthGuard, HubAdminGuard)
export class PerimetreAnnuaireController {
  constructor(private annuaire: AnnuaireService) {}

  @Get()
  async lire(@Req() req: R): Promise<PerimetreAnnuaireDto> {
    return { perimetre: await this.annuaire.perimetre(req.user.societeId) };
  }

  @Put()
  regler(@Req() req: R, @Body() dto: ReglerPerimetreDto): Promise<PerimetreAnnuaireDto> {
    return this.annuaire.regler(req.user.societeId, dto.perimetre, dto.motif.trim(), req.user.userId);
  }
}
