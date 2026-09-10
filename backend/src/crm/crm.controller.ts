import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAccesGuard } from '../commun/societe-acces.guard';
import { CrmService } from './crm.service';
import { ChangerStatutDto, CreerDossierDto } from './dto';

type Req = { user: { societeId: string } };

@Controller('societes/:slug/dossiers')
@UseGuards(JwtAuthGuard, SocieteAccesGuard)
export class CrmController {
  constructor(private crm: CrmService) {}

  @Get()
  findAll(@Req() req: Req, @Query('q') q?: string) {
    return this.crm.findAll(req.user.societeId, q);
  }

  @Post()
  creer(@Req() req: Req, @Body() dto: CreerDossierDto) {
    return this.crm.creer(req.user.societeId, dto);
  }

  @Patch(':id')
  changerStatut(
    @Req() req: Req,
    @Param('id') id: string,
    @Body() dto: ChangerStatutDto,
  ) {
    return this.crm.changerStatut(req.user.societeId, id, dto.statut);
  }
}
