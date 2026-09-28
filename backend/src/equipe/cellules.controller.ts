import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { CellulesService } from './cellules.service';
import { CreerCelluleDto, DefinirDispatcherDto, MajCelluleDto } from './dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/cellules')
// Module « équipe » de la matrice (cf. CollaborateursController).
@PermissionSelonMethode('equipe')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class CellulesController {
  constructor(private cellules: CellulesService) {}

  @Get()
  findAll(@Req() req: R) {
    return this.cellules.findAll(req.user.societeId);
  }

  @Post()
  creer(@Req() req: R, @Body() dto: CreerCelluleDto) {
    return this.cellules.creer(req.user.societeId, dto);
  }

  @Patch(':id')
  renommer(@Req() req: R, @Param('id') id: string, @Body() dto: MajCelluleDto) {
    return this.cellules.renommer(req.user.societeId, id, dto);
  }

  // Désigner/retirer le dispatcher de la cellule — écriture sur « équipe »
  // (admin ou Dir. GC), comme tout ce contrôleur.
  @Patch(':id/dispatcher')
  definirDispatcher(
    @Req() req: R,
    @Param('id') id: string,
    @Body() dto: DefinirDispatcherDto,
  ) {
    return this.cellules.definirDispatcher(req.user.societeId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  supprimer(@Req() req: R, @Param('id') id: string) {
    return this.cellules.supprimer(req.user.societeId, id);
  }
}
