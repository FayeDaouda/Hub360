import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { LectureLocalitesGuard } from './lecture-localites.guard';
import { LocalitesService } from './localites.service';
import { CreerLocaliteDto, MajLocaliteDto } from './dto';

// Le référentiel est global (pas de societeId), mais la route reste sous
// /societes/:slug pour réutiliser les gardes existants. Écriture : direction
// qui gère le référentiel (societe_admin ou CIO). Lecture : aussi tout rôle
// qui consulte le CRM (liste déroulante des dossiers).
@Controller('societes/:slug/localites')
@UseGuards(JwtAuthGuard)
export class LocalitesController {
  constructor(private localites: LocalitesService) {}

  @Get()
  @UseGuards(LectureLocalitesGuard)
  lister() {
    return this.localites.lister();
  }

  @Post()
  @UseGuards(SocieteAdminOuCioGuard)
  creer(@Body() dto: CreerLocaliteDto) {
    return this.localites.creer(dto);
  }

  @Patch(':id')
  @UseGuards(SocieteAdminOuCioGuard)
  modifier(@Param('id') id: string, @Body() dto: MajLocaliteDto) {
    return this.localites.modifier(id, dto);
  }
}
