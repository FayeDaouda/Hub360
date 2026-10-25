import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ModePaiementSalaire, SituationFamiliale } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { MonEspaceService } from './mon-espace.service';
import { GroupScope } from '../tenancy/tenant-scope.decorators';

// « Mes informations » (maquette) : ce que le salarié modifie lui-même,
// enregistré immédiatement. Mêmes limites que DossierPersonnelDto.
class CoordonneesDto {
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsEmail() @MaxLength(120) emailPerso?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(SituationFamiliale)
  situationFamiliale?: SituationFamiliale | null;
  @IsOptional() @IsInt() @Min(0) @Max(30) enfantsACharge?: number;
  @IsOptional() @IsString() @MaxLength(300) adresse?: string;
  @IsOptional() @IsString() @MaxLength(200) contactUrgence?: string;
  @IsOptional() @IsString() @MaxLength(40) telephoneUrgence?: string;
}

// Changement de moyen de paiement : soumis à la RH, appliqué après validation.
class DemandePaiementDto {
  @IsEnum(ModePaiementSalaire) modePaiement!: ModePaiementSalaire;
  @IsString() @MaxLength(80) coordonneesPaiement!: string;
}

type R = { user: { userId: string; societeId: string } };

// « Mon espace » (lot 5) : tout compte connecté, sur son propre dossier.
@GroupScope()
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

  @Post('paiement')
  paiement(@Req() req: R, @Body() dto: DemandePaiementDto) {
    return this.monEspace.demanderPaiement(req.user, dto);
  }

  @Post('attestations')
  demanderAttestation(@Req() req: R) {
    return this.monEspace.demanderAttestation(req.user);
  }

  @Get('attestations/:id')
  attestation(@Req() req: R, @Param('id', ParseUUIDPipe) id: string) {
    return this.monEspace.attestation(req.user, id);
  }

  @Get('bulletins/:mois')
  bulletin(@Req() req: R, @Param('mois') mois: string) {
    return this.monEspace.bulletin(req.user, mois);
  }

  @Get('cellule')
  cellule(@Req() req: R) {
    return this.monEspace.maCellule(req.user);
  }

  @Get('documents/:type')
  document(@Req() req: R, @Param('type') type: string) {
    return this.monEspace.document(req.user, type);
  }
}
