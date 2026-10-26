import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ProfilService } from './profil.service';

class NomAfficheDto {
  // null ou vide : revenir au nom officiel.
  @IsOptional() @IsString() @MaxLength(120) nomAffiche: string | null;
}

class PhotoDto {
  // data URI image (JPEG, PNG, WebP), déjà recadrée et allégée par le navigateur.
  @IsString() @MaxLength(600_000) image: string;
}

type R = { user: { userId: string } };

// Mon compte (menu sous l'avatar) : la personne connectée, sur elle-même.
@Controller('auth/moi')
@UseGuards(JwtAuthGuard)
export class MonCompteController {
  constructor(private profil: ProfilService) {}

  @Get()
  lire(@Req() req: R) {
    return this.profil.lire(req.user.userId);
  }

  @Patch()
  changerNomAffiche(@Req() req: R, @Body() dto: NomAfficheDto) {
    return this.profil.changerNomAffiche(req.user.userId, dto.nomAffiche ?? null);
  }

  @Put('photo')
  changerPhoto(@Req() req: R, @Body() dto: PhotoDto) {
    return this.profil.changerPhoto(req.user.userId, dto.image);
  }

  @Delete('photo')
  retirerPhoto(@Req() req: R) {
    return this.profil.retirerPhoto(req.user.userId);
  }

  @Post('deconnexion-partout')
  @HttpCode(200)
  deconnecterPartout(@Req() req: R) {
    return this.profil.deconnecterPartout(req.user.userId);
  }
}

// Photo de profil, publique par sa clé non devinable (une balise <img>
// n'envoie pas le jeton) ; mise en cache longue, la clé change à chaque photo.
@Controller('photos')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 300, ttl: 60_000 } })
export class PhotosController {
  constructor(private profil: ProfilService) {}

  @Get(':cle')
  async photo(@Param('cle', ParseUUIDPipe) cle: string, @Res() res: Response) {
    const { type, octets } = await this.profil.photo(cle);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Image affichée par le front, qui peut être sur une autre origine (dev :
    // ports différents) : Helmet pose « same-origin » par défaut.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(octets);
  }
}
