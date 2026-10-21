import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../../commun/back-office.guard';
import { PermissionGuard } from '../../commun/permission.guard';
import { RequiertPermission } from '../../commun/permission.decorator';
import { RentabiliteService } from './rentabilite.service';

class ParametreDto {
  @IsIn(['heures_annuelles', 'coefficient_charges', 'marge_cible']) cle!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber() valeur!: number | null;
  @Matches(/^\d{4}-\d{2}-01$/, { message: 'La date d’effet est le 1er d’un mois.' }) dateEffet!: string;
  @IsString() @MinLength(3, { message: 'Le motif est obligatoire.' }) @MaxLength(300) motif!: string;
}

type R = { user: { userId: string; societeId: string; role: string } };

// Rentabilité par projet, phase 1 (lot 7) : module finances_marges en
// lecture, puis la fonction (CFO, CEO : montants ; CTO : taux et couleur ;
// paramètres modifiés par le CFO seul) — vérifiée par le service.
@Controller('societes/:slug/finances/rentabilite')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
@RequiertPermission('finances_marges', 'lecture')
export class RentabiliteController {
  constructor(private rentabilite: RentabiliteService) {}

  @Get()
  portefeuille(@Req() req: R, @Query('periode') periode?: string) {
    return this.rentabilite.portefeuille(req.user, periode || undefined);
  }

  @Get('parametres')
  parametres(@Req() req: R) {
    return this.rentabilite.parametres(req.user);
  }

  @Post('parametres')
  modifier(@Req() req: R, @Body() dto: ParametreDto) {
    return this.rentabilite.modifierParametre(req.user, { ...dto, valeur: dto.valeur ?? null });
  }

  @Get('projets/:id')
  fiche(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentabilite.fiche(req.user, id);
  }

  @Get('projets/:id/salaries')
  salaries(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentabilite.salaries(req.user, id);
  }
}
