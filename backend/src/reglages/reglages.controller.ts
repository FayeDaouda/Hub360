import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocieteAdminOuCioGuard } from '../commun/societe-admin-ou-cio.guard';
import { ReglagesService } from './reglages.service';

class ChangementDto {
  @IsString() @MaxLength(80) carte: string;
  @IsOptional() @IsString() @MaxLength(80) tache?: string;
  @IsIn(['debut', 'fin', 'heures', 'visa', 'fichier']) champ: 'debut' | 'fin' | 'heures' | 'visa' | 'fichier';
  @IsNumber() valeur: number;
}

class MotifDto {
  @IsString() @MinLength(3, { message: 'Motif obligatoire.' }) @MaxLength(500) motif: string;
}

class GabaritDto extends MotifDto {
  @IsInt() depuis: number; // version éditée (contrôle de concurrence)
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChangementDto) changements: ChangementDto[];
}

class ValeursDto extends MotifDto {
  @IsObject() valeurs: Record<string, unknown>;
}

type R = { user: { userId: string; societeId: string } };

// Réglages du HUB : administration de plateforme (CIO, ou l'admin de la
// société), hors matrice des modules — même garde que les gabarits.
@Controller('societes/:slug/reglages')
@UseGuards(JwtAuthGuard, SocieteAdminOuCioGuard)
export class ReglagesController {
  constructor(private reglages: ReglagesService) {}

  @Get()
  lire(@Req() req: R) {
    return this.reglages.lire(req.user.societeId);
  }

  @Get('journal')
  journal(@Req() req: R) {
    return this.reglages.journal(req.user.societeId);
  }

  @Put('gabarits/:code')
  gabarit(@Req() req: R, @Param('code') code: string, @Body() dto: GabaritDto) {
    return this.reglages.majGabarit(req.user.societeId, req.user.userId, code, dto);
  }

  @Put('regles')
  regles(@Req() req: R, @Body() dto: ValeursDto) {
    return this.reglages.majValeurs(req.user.societeId, req.user.userId, 'regles', dto);
  }

  @Put('objectifs')
  objectifs(@Req() req: R, @Body() dto: ValeursDto) {
    return this.reglages.majValeurs(req.user.societeId, req.user.userId, 'objectifs', dto);
  }
}
