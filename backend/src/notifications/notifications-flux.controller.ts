import { Controller, Req, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationsBus } from '../realtime/notifications.bus';
import { TicketNotificationsGuard } from '../realtime/ticket.guard';
import type { TicketPayload } from '../realtime/ticket.store';

type R = { ticket: TicketPayload };

// Flux SSE des notifications (09/11/2026) — HORS JwtAuthGuard (EventSource ne
// pose pas d'en-tête) : TicketNotificationsGuard valide et consomme le
// ?token= obtenu par POST …/notifications/ticket (jamais un ticket du chat). Chacun ne reçoit que SES signaux.
@Controller()
export class NotificationsFluxController {
  constructor(private readonly bus: NotificationsBus) {}

  @Sse('societes/:slug/notifications/flux')
  @UseGuards(TicketNotificationsGuard)
  flux(@Req() req: R): Observable<MessageEvent> {
    return this.bus.forUser(req.ticket.userId, req.ticket.societeId);
  }
}
