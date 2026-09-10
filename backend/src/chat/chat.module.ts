import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatBus } from './chat.bus';
import { ChatController } from './chat.controller';
import { ChatFluxController } from './chat-flux.controller';
import { AccesCanalGuard } from './acces-canal.guard';
import { TicketGuard } from './ticket.guard';
import { TicketStore } from './ticket.store';

// Chat multi-canaux (lot 3) : modèle d'accès + surface REST + store de tickets
// + flux SSE (émetteur ChatBus interne, réception seule ; l'envoi passe par REST).
@Module({
  providers: [ChatService, ChatBus, AccesCanalGuard, TicketGuard, TicketStore],
  controllers: [ChatController, ChatFluxController],
  exports: [ChatService, ChatBus, TicketStore],
})
export class ChatModule {}
