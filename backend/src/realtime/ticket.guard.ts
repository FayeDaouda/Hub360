import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TicketStream, TicketStore, TicketPayload } from './ticket.store';
import { identifyCompany } from '../tenancy/tenant-context';

// Valide (et consomme — usage unique) le ticket ?token= AVANT que NestJS
// n'engage la réponse en text/event-stream : un ticket invalide donne alors un
// vrai HTTP 401 (EventSource échoue définitivement, pas de boucle de reconnexion)
// plutôt qu'un `event: error` déguisé en 200.
// Corollaire : la reconnexion se refait avec un ticket frais (le front
// réorchestre : POST …/ticket → nouvel EventSource).
abstract class TicketGuardBase implements CanActivate {
  // Le seul flux que cette garde ouvre.
  protected abstract readonly stream: TicketStream;

  constructor(private tickets: TicketStore) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = req.query?.token as string | undefined;
    const slug = req.params?.slug as string | undefined;

    const payload = token ? this.tickets.consommer(token) : null;
    if (!payload || payload.societeSlug !== slug || payload.stream !== this.stream) {
      throw new UnauthorizedException('Ticket de flux invalide ou expiré');
    }
    (req as { ticket?: TicketPayload }).ticket = payload;
    identifyCompany(payload.societeId);
    return true;
  }
}

// Flux de la messagerie : tickets émis par POST …/chat/ticket seulement.
// Constructeur explicite dans chaque garde : Nest lit les dépendances à
// injecter sur la classe décorée ; héritées d'une base non décorée, elles
// manqueraient (TicketStore undefined → 500 sur le flux, 09/11/2026).
@Injectable()
export class TicketGuard extends TicketGuardBase {
  protected readonly stream = 'chat' as const;

  constructor(tickets: TicketStore) {
    super(tickets);
  }
}

// Flux des notifications : tickets émis par POST …/notifications/ticket.
@Injectable()
export class TicketNotificationsGuard extends TicketGuardBase {
  protected readonly stream = 'notifications' as const;

  constructor(tickets: TicketStore) {
    super(tickets);
  }
}
