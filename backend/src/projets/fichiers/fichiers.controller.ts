import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { PermissionSelonMethode } from '../../commun/permission.decorator';
import { PermissionGuard } from '../../commun/permission.guard';
import { FichiersService } from './fichiers.service';
import { AjouterFichiersDto, PatchFichierDto, SupprimerFichiersDto } from './dto';

type R = { user: { societeId: string; userId: string } };

// Section « Documents » : livrables non-images. Même garde que les images
// (AccesProjetGuard : collaborateur lecture seule + périmètre cellule), et
// module « documents » de la matrice pour les rôles métier (13/10/2026).
@Controller('societes/:slug/projets/:id/fichiers')
@PermissionSelonMethode('documents', { roleHorsMatrice: 'collaborateur' })
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class FichiersController {
  constructor(private fichiers: FichiersService) {}

  @Get()
  liste(
    @Req() req: R,
    @Param('id') id: string,
    @Query('supprimes') supprimes?: string,
  ) {
    return this.fichiers.liste(req.user.societeId, id, supprimes === '1');
  }

  @EcritureCollaborateur()
  @Post()
  ajouter(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterFichiersDto) {
    return this.fichiers.ajouter(req.user.societeId, id, dto, req.user.userId);
  }

  @EcritureCollaborateur()
  @Patch(':fichierId')
  majUne(
    @Req() req: R,
    @Param('id') id: string,
    @Param('fichierId') fichierId: string,
    @Body() dto: PatchFichierDto,
  ) {
    return this.fichiers.majUne(req.user.societeId, id, fichierId, dto);
  }

  @EcritureCollaborateur()
  @Delete()
  supprimer(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: SupprimerFichiersDto,
  ) {
    return this.fichiers.supprimer(req.user.societeId, id, dto.ids, req.user.userId);
  }

  @EcritureCollaborateur()
  @Post(':fichierId/restauration')
  restaurer(
    @Req() req: R,
    @Param('id') id: string,
    @Param('fichierId') fichierId: string,
  ) {
    return this.fichiers.restaurer(req.user.societeId, id, fichierId);
  }
}
