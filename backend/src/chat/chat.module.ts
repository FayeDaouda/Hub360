import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatService } from './chat.service';
import { ChatBus } from './chat.bus';
import { ChatController } from './chat.controller';
import { ChatFluxController } from './chat-flux.controller';
import { AccesCanalGuard } from './acces-canal.guard';
import { RealtimeModule } from '../realtime/realtime.module';

// Chat multi-canaux (lot 3) : modèle d'accès + surface REST + store de tickets
// + flux SSE (émetteur ChatBus interne, réception seule ; l'envoi passe par REST).
@Module({
  // Tickets du flux : module temps réel (partagés avec les notifications).
  imports: [NotificationsModule, RealtimeModule], // mentions, ajout à un groupe
  providers: [ChatService, ChatBus, AccesCanalGuard],
  controllers: [ChatController, ChatFluxController],
  exports: [ChatService, ChatBus],
})
export class ChatModule {}
