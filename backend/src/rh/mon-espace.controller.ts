import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { MonEspaceService } from './mon-espace.service';

// Mêmes limites que DossierPersonnelDto.
class CoordonneesDto {
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @IsString() @MaxLength(200) contactUrgence?: string;
}

type R = { user: { userId: string } };

// « Mon espace » (lot 5) : tout compte connecté, sur son propre dossier.
@Controller('societes/:slug/mon-espace')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class MonEspaceController {
  constructor(private monEspace: MonEspaceService) {}

  @Get()
  profil(@Req() req: R) {
    return this.monEspace.profil(req.user);
  }

  @Patch('coordonnees')
  coordonnees(@Req() req: R, @Body() dto: CoordonneesDto) {
    return this.monEspace.majCoordonnees(req.user, dto);
  }

  @Get('documents/:type')
  document(@Req() req: R, @Param('type') type: string) {
    return this.monEspace.document(req.user, type);
  }
}
