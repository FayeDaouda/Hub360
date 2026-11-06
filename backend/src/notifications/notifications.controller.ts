import { Body, Controller, Delete, Get, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { NotificationsService } from './notifications.service';
import { AbonnementPushDto, DesabonnementPushDto, LectureDto, PreferencesNotificationsDto } from './notifications.dto';
import { PushService } from './push.service';

type R = { user: { societeId: string; userId: string } };

// Ouvert à tout membre de la société (garde « membre », pas « admin ») :
// chacun lit / marque lues SES propres notifications — l'id vient du token,
// jamais de l'URL.
@Controller('societes/:slug/notifications')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  @Get()
  flux(@Req() req: R) {
    return this.notifications.flux(req.user.societeId, req.user.userId);
  }

  // Sans corps : tout ; { types } : seulement ces types (onglet ouvert) ;
  // { ids } : seulement celles-ci (toujours parmi les siennes).
  @Patch('lecture')
  marquerLues(@Req() req: R, @Body() dto: LectureDto) {
    return this.notifications.marquerLues(req.user.societeId, req.user.userId, dto?.types, dto?.ids);
  }

  @Get('non-lues-par-type')
  nonLuesParType(@Req() req: R) {
    return this.notifications.nonLuesParType(req.user.societeId, req.user.userId);
  }

  // Préférences de la personne (02/11/2026) : pop-up, son, notification
  // système par catégorie, heures calmes — les mêmes sur tous ses appareils.
  @Get('preferences')
  preferences(@Req() req: R) {
    return this.push.preferences(req.user.userId);
  }

  @Put('preferences')
  majPreferences(@Req() req: R, @Body() dto: PreferencesNotificationsDto) {
    return this.push.majPreferences(req.user.userId, dto);
  }

  // Notifications système : clé publique (null = désactivées sur ce serveur),
  // abonnement et désabonnement de cet appareil.
  @Get('push/cle')
  clePush() {
    return { cle: this.push.clePublique() };
  }

  @Post('push')
  abonner(@Req() req: R, @Body() dto: AbonnementPushDto) {
    return this.push.abonner(req.user.userId, { endpoint: dto.endpoint, ...dto.keys }, dto.appareil);
  }

  @Delete('push')
  desabonner(@Req() req: R, @Body() dto: DesabonnementPushDto) {
    return this.push.desabonner(req.user.userId, dto.endpoint);
  }
}
