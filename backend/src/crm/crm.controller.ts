import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { ETAPE } from '../rights/catalogue';
import { CommercialService } from './commercial.service';
import { Acteur, CrmService } from './crm.service';
import {
  ActionDossierDto,
  ApporteurDto,
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
  constructor(
    private crm: CrmService,
    private commercial: CommercialService,
  ) {}

  // Vue commerciale (revue COO) : « À traiter aujourd'hui » et performance
  // de l'année (?annee=AAAA, l'année en cours par défaut).
  @Get('commercial')
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  vueCommerciale(@Req() req: Req, @Query('annee') annee?: string) {
    const valide = annee && /^\d{4}$/.test(annee) ? annee : String(new Date().getUTCFullYear());
    return this.commercial.vue(req.user, valide);
  }

  @Get()
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  findAll(@Req() req: Req, @Query('q') q?: string) {
    return this.crm.findAll(req.user.societeId, req.user, q);
  }

  // Segment fixe, déclaré avant les routes ':id'.
  @Get('proprietaires-possibles')
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  proprietairesPossibles(@Req() req: Req) {
    return this.crm.proprietairesPossibles(req.user.societeId);
  }

  @Post()
  @RequiertPermission(ETAPE.crmDossiers, 'ecriture')
  creer(@Req() req: Req, @Body() dto: CreerDossierDto) {
    return this.crm.creer(req.user.societeId, req.user, dto);
  }

  // Complétion de la fiche d'un lead (champ par champ, « Nouveau projet »).
  @Patch(':id/fiche')
  @RequiertPermission(ETAPE.crmDossiers, 'ecriture')
  modifierFiche(@Req() req: Req, @Param('id') id: string, @Body() dto: ModifierFicheDto) {
    return this.crm.modifierFiche(req.user.societeId, req.user, id, dto);
  }

  @Patch(':id/localite')
  @RequiertPermission(ETAPE.crmDossiers, 'ecriture')
  rattacherLocalite(@Req() req: Req, @Param('id') id: string, @Body() dto: RattacherLocaliteDto) {
    return this.crm.rattacherLocalite(req.user.societeId, req.user, id, dto.localiteId);
  }

  // Réassigner : étape « Propriétaire du dossier » (matrice, 31/10/2026).
  @Patch(':id/proprietaire')
  @RequiertPermission(ETAPE.crmProprietaire, 'ecriture')
  changerProprietaire(@Req() req: Req, @Param('id') id: string, @Body() dto: ChangerProprietaireDto) {
    return this.crm.changerProprietaire(req.user.societeId, req.user, id, dto.proprietaireId);
  }

  // Fiche apporteur verrouillée depuis la création : étape « Fiche
  // apporteur » (matrice, 31/10/2026 ; le COO au départ).
  @Patch(':id/apporteur')
  @RequiertPermission(ETAPE.crmApporteur, 'ecriture')
  modifierApporteur(@Req() req: Req, @Param('id') id: string, @Body() dto: ApporteurDto) {
    return this.crm.modifierApporteur(req.user.societeId, req.user, id, dto);
  }

  // Archiver / désarchiver : la Suppression de « Dossiers et leads ».
  @Post(':id/archivage')
  @RequiertPermission(ETAPE.crmDossiers, 'suppression')
  archiver(@Req() req: Req, @Param('id') id: string) {
    return this.crm.archiver(req.user.societeId, req.user, id);
  }

  @Post(':id/desarchivage')
  @RequiertPermission(ETAPE.crmDossiers, 'suppression')
  desarchiver(@Req() req: Req, @Param('id') id: string) {
    return this.crm.desarchiver(req.user.societeId, req.user, id);
  }

  // Lecture suffit à la porte : le droit réel dépend de l'action (soumettre :
  // « Soumission au CFO » ; valider : finances_devis) — tranché par le
  // service, cf. crm/cycle.ts.
  @Post(':id/actions')
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  agir(@Req() req: Req, @Param('id') id: string, @Body() dto: ActionDossierDto) {
    return this.crm.agir(req.user.societeId, req.user, id, dto.action, dto.commentaire);
  }

  @Get(':id/historique')
  @RequiertPermission(ETAPE.crmDossiers, 'lecture')
  historique(@Req() req: Req, @Param('id') id: string) {
    return this.crm.historique(req.user.societeId, id);
  }
}
