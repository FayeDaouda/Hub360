import { Controller, Req, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { ChatBus } from './chat.bus';
import { TicketGuard } from './ticket.guard';
import type { TicketPayload } from './ticket.store';

type R = { ticket: TicketPayload };

// Flux SSE — HORS JwtAuthGuard (EventSource ne pose pas d'en-tête). TicketGuard
// valide et consomme le ?token= avant l'engagement du stream. Le contexte de
// l'abonné (dont sa cellule) est résolu une fois à l'ouverture.
@Controller()
export class ChatFluxController {
  constructor(
    private readonly bus: ChatBus,
    private readonly prisma: PrismaService,
  ) {}

  @Sse('societes/:slug/chat/flux')
  @UseGuards(TicketGuard)
  flux(@Req() req: R): Observable<MessageEvent> {
    const { userId, societeId, role } = req.ticket;
    return from(
      this.prisma.collaborateur.findFirst({
        where: { utilisateurId: userId, societeId },
        select: { celluleId: true },
      }),
    ).pipe(
      switchMap((collab) =>
        this.bus.pour({
          userId,
          societeId,
          role,
          celluleId: collab?.celluleId ?? null,
        }),
      ),
    );
  }
}
