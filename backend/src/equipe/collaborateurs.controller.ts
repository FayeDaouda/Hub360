import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAccesGuard } from '../commun/societe-acces.guard';
import { CollaborateursService } from './collaborateurs.service';
import {
  CreerCollaborateurDto,
  InviterCollaborateurDto,
  MajCollaborateurDto,
} from './dto';

type R = { user: { societeId: string; userId: string } };

@Controller('societes/:slug/collaborateurs')
@UseGuards(JwtAuthGuard, SocieteAccesGuard)
export class CollaborateursController {
  constructor(private collaborateurs: CollaborateursService) {}

  // `?cellule=A` (une équipe) ou `?cellule=A&cellule=B` (plusieurs — Nest
  // renvoie alors un tableau) : cf. CollaborateursService.findAll.
  @Get()
  findAll(
    @Req() req: R,
    @Query('q') q?: string,
    @Query('cellule') cellule?: string | string[],
  ) {
    return this.collaborateurs.findAll(req.user.societeId, q, cellule);
  }

  // GET :id/indicateurs vit dans IndicateursController — accès élargi au
  // collaborateur concerné (garde AccesIndicateursGuard), pas seulement l'admin.

  @Post()
  creer(@Req() req: R, @Body() dto: CreerCollaborateurDto) {
    return this.collaborateurs.creer(req.user.societeId, dto);
  }

  @Post(':id/invitation')
  @HttpCode(200)
  inviter(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: InviterCollaborateurDto,
  ) {
    return this.collaborateurs.inviter(
      req.user.societeId,
      id,
      dto.email,
      req.user.userId,
    );
  }

  @Patch(':id')
  maj(@Req() req: R, @Param('id') id: string, @Body() dto: MajCollaborateurDto) {
    return this.collaborateurs.maj(req.user.societeId, id, dto, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  supprimer(@Req() req: R, @Param('id') id: string) {
    return this.collaborateurs.supprimer(req.user.societeId, id);
  }
}
