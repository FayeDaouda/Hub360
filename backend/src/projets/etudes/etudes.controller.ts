import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { PermissionSelonMethode } from '../../commun/permission.decorator';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import type { NiveauPermission } from '@prisma/client';
import { EtudesService, type ActeurEtudes } from './etudes.service';
import {
  JoindreFichiersItemEtudeDto,
  JoindreImagesItemEtudeDto,
  PatchBlocEtudeDto,
  PatchItemEtudeDto,
} from './dto';

type R = {
  user: {
    societeId: string;
    userId: string;
    role: string;
    permissions?: Record<string, NiveauPermission>;
  };
};

// Rôle + carte de la matrice : les factures des bureaux d'études en dépendent
// (cf. EtudesService.voitFactures / modifieFactures).
const acteur = (req: R): ActeurEtudes => ({ role: req.user.role, permissions: req.user.permissions });

@Controller('societes/:slug/projets/:id/etudes')
@PermissionSelonMethode('projets', { roleHorsMatrice: 'collaborateur' })
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class EtudesController {
  constructor(private etudes: EtudesService) {}

  @Get()
  get(@Req() req: R, @Param('id') id: string) {
    return this.etudes.get(req.user.societeId, id, acteur(req));
  }

  @EcritureCollaborateur()
  @Patch('blocs/:blocId')
  patchBloc(
    @Req() req: R,
    @Param('id') id: string,
    @Param('blocId') blocId: string,
    @Body() dto: PatchBlocEtudeDto,
  ) {
    return this.etudes.patchBloc(req.user.societeId, id, blocId, dto, acteur(req));
  }

  @EcritureCollaborateur()
  @Patch('items/:itemId')
  patchItem(
    @Req() req: R,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: PatchItemEtudeDto,
  ) {
    return this.etudes.patchItem(req.user.societeId, id, itemId, dto, acteur(req));
  }

  @EcritureCollaborateur()
  @Post('items/:itemId/images')
  joindreImages(
    @Req() req: R,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: JoindreImagesItemEtudeDto,
  ) {
    return this.etudes.joindreImages(
      req.user.societeId,
      id,
      itemId,
      dto,
      req.user.userId,
      acteur(req),
    );
  }

  @EcritureCollaborateur()
  @Post('items/:itemId/fichiers')
  joindreFichiers(
    @Req() req: R,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: JoindreFichiersItemEtudeDto,
  ) {
    return this.etudes.joindreFichiers(
      req.user.societeId,
      id,
      itemId,
      dto,
      req.user.userId,
      acteur(req),
    );
  }

  @EcritureCollaborateur()
  @Post('dce')
  constituerDce(@Req() req: R, @Param('id') id: string) {
    return this.etudes.constituerDce(req.user.societeId, id, acteur(req));
  }

  @EcritureCollaborateur()
  @Delete('dce')
  annulerDce(@Req() req: R, @Param('id') id: string) {
    return this.etudes.annulerDce(req.user.societeId, id, acteur(req));
  }
}
