import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { NotificationsService } from './notifications.service';

type R = { user: { societeId: string; userId: string } };

class LectureDto {
  @IsOptional() @IsArray() @IsEnum(NotificationType, { each: true }) types?: NotificationType[];
  // Ces notifications seulement (« Vu » du contrôle interne, revue CEO).
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ids?: string[];
}

// Ouvert à tout membre de la société (garde « membre », pas « admin ») :
// chacun lit / marque lues SES propres notifications — l'id vient du token,
// jamais de l'URL.
@Controller('societes/:slug/notifications')
@UseGuards(JwtAuthGuard, MembreSocieteGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

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
}
