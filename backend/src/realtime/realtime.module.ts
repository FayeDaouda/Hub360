import { Module } from '@nestjs/common';
import { NotificationsBus } from './notifications.bus';
import { TicketGuard, TicketNotificationsGuard } from './ticket.guard';
import { TicketStore } from './ticket.store';

// Temps réel (09/11/2026) : tickets des flux SSE (messagerie, notifications)
// et signal des notifications. Sans dépendance : la messagerie, les
// notifications et les réglages l'importent sans import circulaire.
@Module({
  providers: [TicketStore, TicketGuard, TicketNotificationsGuard, NotificationsBus],
  exports: [TicketStore, TicketGuard, TicketNotificationsGuard, NotificationsBus],
})
export class RealtimeModule {}
