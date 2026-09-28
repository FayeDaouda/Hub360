import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { TypePieceDossier } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackOfficeGuard } from '../commun/back-office.guard';
import { PermissionGuard } from '../commun/permission.guard';
import { PermissionSelonMethode } from '../commun/permission.decorator';
import { DossiersPersonnelService } from './dossiers.service';
import { ArchivageDto, DossierPersonnelDto, PieceDto } from './dto';

type R = { user: { userId: string } };

// RH · Dossiers du personnel (groupe) — module « rh » de la matrice : lecture
// en GET (CFO, CEO), écriture sinon (RH ; admin inchangé).
@Controller('societes/:slug/rh/dossiers')
@PermissionSelonMethode('rh')
@UseGuards(JwtAuthGuard, BackOfficeGuard, PermissionGuard)
export class DossiersPersonnelController {
  constructor(private dossiers: DossiersPersonnelService) {}

  @Get()
  lister() {
    return this.dossiers.lister();
  }

  @Get('options')
  options() {
    return this.dossiers.options();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.dossiers.detail(id);
  }

  @Get(':id/pieces/:type')
  piece(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(TypePieceDossier)) type: TypePieceDossier,
  ) {
    return this.dossiers.piece(id, type);
  }

  @Post()
  creer(@Req() req: R, @Body() dto: DossierPersonnelDto) {
    return this.dossiers.creer(dto, req.user.userId);
  }

  @Patch(':id')
  maj(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DossierPersonnelDto) {
    return this.dossiers.maj(id, dto);
  }

  @Post(':id/archivage')
  archiver(@Req() req: R, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchivageDto) {
    return this.dossiers.archiver(id, dto.archive, req.user.userId);
  }

  @Put(':id/pieces/:type')
  joindre(
    @Req() req: R,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(TypePieceDossier)) type: TypePieceDossier,
    @Body() dto: PieceDto,
  ) {
    return this.dossiers.joindrePiece(id, type, dto, req.user.userId);
  }
}
