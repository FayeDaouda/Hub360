import { Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembreSocieteGuard } from '../commun/membre-societe.guard';
import { NotificationsService } from './notifications.service';

type R = { user: { societeId: string; userId: string } };

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

  @Patch('lecture')
  marquerLues(@Req() req: R) {
    return this.notifications.marquerLues(req.user.societeId, req.user.userId);
  }
}
