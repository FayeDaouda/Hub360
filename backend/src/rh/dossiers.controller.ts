import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { TypePieceDossier } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { DossiersPersonnelService } from './dossiers.service';
import { ArchivageDto, DecisionPaiementDto, DossierPersonnelDto, PieceDto, PropositionSalaireDto } from './dto';
import { SalairesService } from './salaires.service';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

type R = { user: { userId: string } };

// RH · Dossiers du personnel (groupe) — module « rh » de la matrice : lecture
// en GET (CFO, CEO), écriture sinon (RH ; admin inchangé).
@GroupScope()
@Controller('societes/:slug/rh/dossiers')
@PermissionSelonMethode('rh')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class DossiersPersonnelController {
  constructor(
    private dossiers: DossiersPersonnelService,
    private salaires: SalairesService,
  ) {}

  @Get()
  lister() {
    return this.dossiers.lister();
  }

  @Get('options')
  options() {
    return this.dossiers.options();
  }

  // Masse salariale (agrégat) : segment fixe, déclaré avant ':id'.
  @Get('masse-salariale')
  masseSalariale() {
    return this.dossiers.masseSalariale();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.dossiers.detail(id);
  }

  // Salaire d'un dossier (en vigueur + historique) : affiché à la demande,
  // chaque affichage tracé. La RH propose un changement, le CFO le valide.
  @Get(':id/salaire')
  salaire(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.salaires.historique(id, req.user.userId);
  }

  @Post(':id/salaires')
  proposerSalaire(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PropositionSalaireDto) {
    return this.salaires.proposer(id, dto, req.user.userId);
  }

  @Delete(':id/salaires/:changementId')
  async retirerSalaire(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Param('changementId', ParseUUIDPipe) changementId: string) {
    await this.salaires.retirer(id, changementId);
    return this.salaires.historique(id, req.user.userId);
  }

  @Get(':id/pieces/:type')
  piece(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(TypePieceDossier)) type: TypePieceDossier,
  ) {
    return this.dossiers.piece(id, type);
  }

  @Post()
  creer(@Req() req: R, @Body() dto: DossierPersonnelDto) {
    return this.dossiers.creer(dto, req.user.userId);
  }

  @Patch(':id')
  maj(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DossierPersonnelDto) {
    return this.dossiers.maj(id, dto, req.user.userId);
  }

  // Avant un départ : tâches de projet à réaffecter et collègues possibles.
  @Get(':id/taches-ouvertes')
  tachesOuvertes(@Param('id', ParseUUIDPipe) id: string) {
    return this.dossiers.tachesOuvertes(id);
  }

  @Post(':id/archivage')
  archiver(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchivageDto) {
    return this.dossiers.archiver(id, dto.archive, req.user.userId, dto.reaffectations);
  }

  @Post(':id/paiement')
  deciderPaiement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionPaiementDto) {
    return this.dossiers.deciderPaiement(id, dto.valide);
  }

  @Put(':id/pieces/:type')
  joindre(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(TypePieceDossier)) type: TypePieceDossier,
    @Body() dto: PieceDto,
  ) {
    return this.dossiers.joindrePiece(id, type, dto, req.user.userId);
  }

  // Bulletins de paie (lot 5b).
  @Get(':id/bulletins/:mois')
  bulletin(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Param('mois') mois: string) {
    return this.dossiers.bulletin(id, mois, req.user.userId);
  }

  @Put(':id/bulletins/:mois')
  deposerBulletin(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Param('mois') mois: string, @Body() dto: PieceDto) {
    return this.dossiers.deposerBulletin(id, mois, dto, req.user.userId);
  }

  @Delete(':id/bulletins/:mois')
  retirerBulletin(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Param('mois') mois: string) {
    return this.dossiers.retirerBulletin(id, mois, req.user.userId);
  }
}
