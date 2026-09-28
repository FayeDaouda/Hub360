import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccesProjetGuard } from '../acces-projet.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { PermissionSelonMethode } from '../../commun/permission.decorator';
import { EcritureCollaborateur } from '../ecriture-collaborateur.decorator';
import { ImagesService } from './images.service';
import {
  AjouterImagesDto,
  PatchImageDto,
  PatchImagesEnLotDto,
  ReordonnerImagesDto,
  SupprimerImagesDto,
} from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/projets/:id/images')
@PermissionSelonMethode('projets', { roleHorsMatrice: 'collaborateur' })
@UseGuards(JwtAuthGuard, AccesProjetGuard, PermissionGuard)
export class ImagesController {
  constructor(private images: ImagesService) {}

  @Get()
  liste(
    @Req() req: R,
    @Param('id') id: string,
    @Query('supprimees') supprimees?: string,
  ) {
    return this.images.liste(req.user.societeId, id, supprimees === '1');
  }

  @EcritureCollaborateur()
  @Post()
  ajouter(@Req() req: R, @Param('id') id: string, @Body() dto: AjouterImagesDto) {
    return this.images.ajouter(req.user.societeId, id, dto, req.user.userId);
  }

  @EcritureCollaborateur()
  @Put('ordre')
  reordonner(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: ReordonnerImagesDto,
  ) {
    return this.images.reordonner(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Patch()
  majEnLot(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: PatchImagesEnLotDto,
  ) {
    return this.images.majEnLot(req.user.societeId, id, dto);
  }

  @EcritureCollaborateur()
  @Patch(':imageId')
  majUne(
    @Req() req: R,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() dto: PatchImageDto,
  ) {
    return this.images.majUne(req.user.societeId, id, imageId, dto);
  }

  @EcritureCollaborateur()
  @Delete()
  supprimer(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: SupprimerImagesDto,
  ) {
    return this.images.supprimer(req.user.societeId, id, dto.ids, req.user.userId);
  }

  @EcritureCollaborateur()
  @Post(':imageId/restauration')
  restaurer(
    @Req() req: R,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.images.restaurer(req.user.societeId, id, imageId);
  }
}
