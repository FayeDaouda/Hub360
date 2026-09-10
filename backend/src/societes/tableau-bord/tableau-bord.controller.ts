import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SocieteAccesGuard } from '../../commun/societe-acces.guard';
import { TableauBordService } from './tableau-bord.service';
import { estPeriode } from './periodes';

type R = { user: { societeId: string } };

// Tableau de bord d'une société — réservé à son administration
// (SocieteAccesGuard : token societe_admin émis pour CE slug).
@Controller('societes/:slug/tableau-de-bord')
@UseGuards(JwtAuthGuard, SocieteAccesGuard)
export class TableauBordController {
  constructor(private tableauBord: TableauBordService) {}

  @Get()
  get(@Req() req: R, @Query('periode') periode = 'mois') {
    if (!estPeriode(periode)) {
      throw new BadRequestException(`Période inconnue : ${periode}`);
    }
    return this.tableauBord.pour(req.user.societeId, periode);
  }
}
