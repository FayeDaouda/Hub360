import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { DemandesService } from './demandes.service';
import {
  DecisionN1Dto,
  DeposerAbsenceDto,
  DeposerRemboursementDto,
  RejetDto,
  RembourseDto,
  ReponseAutresDatesDto,
  ValidationRhDto,
} from './demandes.dto';
import { PieceDto } from './dto';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

type R = { user: { userId: string; societeId: string; role: string } };

// Le salarié (espace collaborateur) : ses congés, absences et remboursements.
@GroupScope()
@Controller('societes/:slug/mon-espace')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MesDemandesController {
  constructor(private demandes: DemandesService) {}

  @Get('demandes')
  mesDemandes(@Req() req: R) {
    return this.demandes.mesDemandes(req.user);
  }

  // Dir. GC : suppléants possibles pendant son absence (autre Dir. GC, CTO).
  @Get('suppleants')
  suppleants(@Req() req: R) {
    return this.demandes.suppleantsPossibles(req.user);
  }

  @Post('absences')
  deposer(@Req() req: R, @Body() dto: DeposerAbsenceDto) {
    return this.demandes.deposerAbsence(req.user, dto);
  }

  @Post('absences/:id/reponse')
  repondre(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReponseAutresDatesDto) {
    return this.demandes.repondreAutresDates(req.user, id, dto.accepte);
  }

  @Post('absences/:id/retrait')
  retirer(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.retirer(req.user, id);
  }

  @Post('remboursements')
  rembourser(@Req() req: R, @Body() dto: DeposerRemboursementDto) {
    return this.demandes.deposerRemboursement(req.user, dto);
  }
}

// Le N+1 (chef de cellule côté collaborateur ; Dir. GC, CTO ou CEO côté direction) : le
// service vérifie qu'il est bien le N+1 de chaque demande.
@GroupScope()
@Controller('societes/:slug/absences')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class ValidationsAbsencesController {
  constructor(private demandes: DemandesService) {}

  // ?toutes=1 : aussi les demandes déjà décidées (« Toutes », Mon espace).
  @Get('a-valider')
  aValider(@Req() req: R, @Query('toutes') toutes?: string) {
    return this.demandes.aValider(req.user, toutes === '1');
  }

  // Calendrier de la cellule autour de la demande (N+1, CEO en validation finale).
  @Get(':id/calendrier')
  calendrier(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.calendrierPourDecideur(req.user, id);
  }

  @Get(':id/preparation')
  preparation(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.preparationDecision(req.user, id);
  }

  @Post(':id/decision')
  decider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionN1Dto) {
    return this.demandes.decider(req.user, id, dto);
  }

  // Validation finale d'une demande de la RH : le CEO (vérifié par le service).
  @Post(':id/validation-finale')
  validationFinale(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidationRhDto) {
    return this.demandes.validationFinaleCeo(req.user, id, dto.valide, dto.motif);
  }
}

// La RH : toutes les demandes ; validation finale et suivi des remboursements.
// Module « rh » : lecture CFO/CEO, écriture RH.
@GroupScope()
@Controller('societes/:slug/rh/demandes')
@PermissionSelonMethode('rh')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class DemandesRhController {
  constructor(private demandes: DemandesService) {}

  @Get()
  lister() {
    return this.demandes.listeRh();
  }

  // Page RH (RH, CFO, CEO) : le motif des absences à la RH seule.
  @Get('absences/:id/calendrier')
  calendrier(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.calendrierCellule(id, req.user.role === 'RH');
  }

  @Get('absences/:id/justificatif')
  justifAbsence(@Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.justificatif('absence', id);
  }

  @Get('justificatifs/:id')
  justifRemboursement(@Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.justificatif('remboursement', id);
  }

  @Post('absences/:id/validation')
  valider(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidationRhDto) {
    return this.demandes.validationRh(req.user, id, dto.valide, dto.motif);
  }

  @Post('attestations/:id/delivrance')
  delivrer(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PieceDto) {
    return this.demandes.delivrerAttestation(req.user, id, dto);
  }

  @Post('remboursements/:id/transmission')
  transmettre(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.demandes.transitionRemboursement(req.user, id, 'transmettre');
  }

  @Post('remboursements/:id/remboursement')
  rembourse(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RembourseDto) {
    return this.demandes.transitionRemboursement(req.user, id, 'rembourser', dto);
  }

  @Post('remboursements/:id/rejet')
  rejeter(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejetDto) {
    return this.demandes.transitionRemboursement(req.user, id, 'rejeter', dto);
  }
}
