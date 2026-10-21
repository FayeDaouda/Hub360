import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { AjouterTsDto, DeciderDemandeTsDto } from '../projets/gabarit/dto';
import { AvenantsTsService } from './avenants-ts.service';

type R = { user: { societeId: string; userId: string; role: string } };

// « Ajouter en TS » de la vue Projets : même adresse qu'avant, servie ici car
// l'ajout écrit aussi le devis d'avenant (DevisModule importe déjà ProjetsModule).
@Controller('societes/:slug/projets-ouverts')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class AvenantsTsController {
  constructor(private avenants: AvenantsTsService) {}

  @Post(':id/ts')
  @RequiertPermission('projets', 'ecriture')
  ajouterTs(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterTsDto) {
    return this.avenants.ajouterTs(req.user.societeId, req.user, id, dto);
  }

  // TS au-delà du seuil : le CTO accepte (ajout) ou refuse (motif) — vérifié
  // par le service.
  @Post(':id/ts/demandes/:demandeId/decision')
  @RequiertPermission('projets', 'lecture')
  deciderDemande(@Req() req: R, @Param('id') id: string, @Param('demandeId') demandeId: string, @Body() dto: DeciderDemandeTsDto) {
    return this.avenants.deciderDemande(req.user.societeId, req.user, id, demandeId, dto.accepter, dto.motif);
  }
}
