import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { Acteur, CrmService } from './crm.service';
import {
  ActionDossierDto,
  ChangerProprietaireDto,
  CreerDossierDto,
  ModifierFicheDto,
  RattacherLocaliteDto,
} from './dto';

type Req = { user: Acteur & { societeId: string } };

// Ouvert aux rôles de direction (étape C2) : chaque route porte son niveau
// sur le module `crm` de la matrice — lecture pour consulter, écriture pour
// créer / modifier. societe_admin a `validation` partout (lignes explicites).
@Controller('societes/:slug/dossiers')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class CrmController {
  constructor(private crm: CrmService) {}

  @Get()
  @RequiertPermission('crm', 'lecture')
  findAll(@Req() req: Req, @Query('q') q?: string) {
    return this.crm.findAll(req.user.societeId, req.user, q);
  }

  // Segment fixe, déclaré avant les routes ':id'.
  @Get('proprietaires-possibles')
  @RequiertPermission('crm', 'lecture')
  proprietairesPossibles(@Req() req: Req) {
    return this.crm.proprietairesPossibles(req.user.societeId);
  }

  @Post()
  @RequiertPermission('crm', 'ecriture')
  creer(@Req() req: Req, @Body() dto: CreerDossierDto) {
    return this.crm.creer(req.user.societeId, req.user, dto);
  }

  // Complétion de la fiche d'un lead (champ par champ, « Nouveau projet »).
  @Patch(':id/fiche')
  @RequiertPermission('crm', 'ecriture')
  modifierFiche(@Req() req: Req, @Param('id') id: string, @Body() dto: ModifierFicheDto) {
    return this.crm.modifierFiche(req.user.societeId, req.user, id, dto);
  }

  @Patch(':id/localite')
  @RequiertPermission('crm', 'ecriture')
  rattacherLocalite(
    @Req() req: Req,
    @Param('id') id: string,
    @Body() dto: RattacherLocaliteDto,
  ) {
    return this.crm.rattacherLocalite(req.user.societeId, req.user, id, dto.localiteId);
  }

  // Écriture sur le CRM ne suffit pas : le service n'autorise que les
  // titulaires Dir. GC, societe_admin et le CIO (cf. changerProprietaire).
  @Patch(':id/proprietaire')
  @RequiertPermission('crm', 'ecriture')
  changerProprietaire(
    @Req() req: Req,
    @Param('id') id: string,
    @Body() dto: ChangerProprietaireDto,
  ) {
    return this.crm.changerProprietaire(
      req.user.societeId,
      req.user,
      id,
      dto.proprietaireId,
    );
  }

  // Même garde que la réassignation (Direction GC, administration, CIO),
  // tranchée par le service.
  @Post(':id/archivage')
  @RequiertPermission('crm', 'ecriture')
  archiver(@Req() req: Req, @Param('id') id: string) {
    return this.crm.archiver(req.user.societeId, req.user, id);
  }

  // Lecture suffit à la porte : le niveau réel dépend de l'action (la DAF,
  // en lecture sur le CRM, valide via finances_devis) — tranché par le
  // service, cf. crm/cycle.ts.
  @Post(':id/actions')
  @RequiertPermission('crm', 'lecture')
  agir(@Req() req: Req, @Param('id') id: string, @Body() dto: ActionDossierDto) {
    return this.crm.agir(req.user.societeId, req.user, id, dto.action, dto.commentaire);
  }

  @Get(':id/historique')
  @RequiertPermission('crm', 'lecture')
  historique(@Req() req: Req, @Param('id') id: string) {
    return this.crm.historique(req.user.societeId, id);
  }
}
