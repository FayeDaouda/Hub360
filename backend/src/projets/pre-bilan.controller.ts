import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { RequiertPermission } from '../commun/permission.decorator';
import { ProjetsService } from './projets.service';
import { PatchVersionDto } from './dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/projets/:id/pre-bilan')
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class PreBilanController {
  constructor(private projets: ProjetsService) {}

  // Premier endpoint réel gouverné par la matrice de permissions plutôt que
  // le seul binaire societe_admin/collaborateur : couts + prixVenteEstime
  // ci-dessous, c'est justement la donnée qui révèle la marge — le cas
  // d'usage qui a motivé tout le chantier (Dir. GC ne doit pas la voir).
  @Get()
  @RequiertPermission('finances_marges', 'lecture')
  get(@Req() req: R, @Param('id') id: string) {
    return this.projets.getPreBilan(req.user.societeId, id);
  }

  @Post('versions')
  ajouterVersion(@Req() req: R, @Param('id') id: string) {
    return this.projets.ajouterVersion(req.user.societeId, id);
  }

  @Patch('versions/:etape')
  patchVersion(
    @Req() req: R,
    @Param('id') id: string,
    @Param('etape') etape: string,
    @Body() dto: PatchVersionDto,
  ) {
    return this.projets.patchVersion(req.user.societeId, id, etape, dto);
  }
}
