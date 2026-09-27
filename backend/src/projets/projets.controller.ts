import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccesProjetGuard } from './acces-projet.guard';
import { ProjetsService } from './projets.service';
import { AssignerDto, PoserPinDto } from './dto';

type R = { user: { societeId: string; userId: string; role: string } };

@Controller('societes/:slug/projets')
@UseGuards(JwtAuthGuard, AccesProjetGuard)
export class ProjetsController {
  constructor(private projets: ProjetsService) {}

  @Get()
  findAll(@Req() req: R) {
    return this.projets.findAll(req.user.societeId, {
      role: req.user.role,
      userId: req.user.userId,
      societeId: req.user.societeId,
    });
  }

  @Get(':id')
  findOne(@Req() req: R, @Param('id') id: string) {
    return this.projets.findOne(req.user.societeId, id);
  }

  @Put(':id/cellules')
  assigner(@Req() req: R, @Param('id') id: string, @Body() dto: AssignerDto) {
    return this.projets.assignerCellules(
      req.user.societeId,
      id,
      dto.celluleIds,
      req.user.userId,
    );
  }

  @Patch(':id/carte')
  poserPin(@Req() req: R, @Param('id') id: string, @Body() dto: PoserPinDto) {
    return this.projets.poserPin(req.user.societeId, id, {
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });
  }
}
