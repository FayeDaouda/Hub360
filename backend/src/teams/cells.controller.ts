import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { CellsService } from './cells.service';
import { CreateCellDto, SetDispatcherDto, RenameCellDto } from './teams.dto';

type R = { user: { societeId: string } };

@Controller('societes/:slug/cellules')
// Module « équipe » de la matrice (cf. EmployeesController).
@PermissionSelonMethode('equipe')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class CellsController {
  constructor(private cells: CellsService) {}

  @Get()
  findAll(@Req() req: R) {
    return this.cells.findAll(req.user.societeId);
  }

  @Post()
  create(@Req() req: R, @Body() dto: CreateCellDto) {
    return this.cells.create(req.user.societeId, dto);
  }

  @Patch(':id')
  rename(@Req() req: R, @Param('id') id: string, @Body() dto: RenameCellDto) {
    return this.cells.rename(req.user.societeId, id, dto);
  }

  // Désigner/retirer le dispatcher de la cellule — écriture sur « équipe »
  // (admin ou Dir. GC), comme tout ce contrôleur.
  @Patch(':id/dispatcher')
  setDispatcher(@Req() req: R, @Param('id') id: string, @Body() dto: SetDispatcherDto) {
    return this.cells.setDispatcher(req.user.societeId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: R, @Param('id') id: string) {
    return this.cells.remove(req.user.societeId, id);
  }
}
