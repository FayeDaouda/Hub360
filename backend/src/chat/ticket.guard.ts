import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TicketStore, TicketPayload } from './ticket.store';
import { identifyCompany } from '../tenancy/tenant-context';

// Valide (et consomme — usage unique) le ticket ?token= AVANT que NestJS
// n'engage la réponse en text/event-stream : un ticket invalide donne alors un
// vrai HTTP 401 (EventSource échoue définitivement, pas de boucle de reconnexion)
// plutôt qu'un `event: error` déguisé en 200.
// Corollaire : la reconnexion se refait avec un ticket frais (le front
// réorchestre : POST /chat/ticket → nouvel EventSource).
@Injectable()
export class TicketGuard implements CanActivate {
  constructor(private tickets: TicketStore) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = req.query?.token as string | undefined;
    const slug = req.params?.slug as string | undefined;

    const payload = token ? this.tickets.consommer(token) : null;
    if (!payload || payload.societeSlug !== slug) {
      throw new UnauthorizedException('Ticket de flux invalide ou expiré');
    }
    (req as { ticket?: TicketPayload }).ticket = payload;
    identifyCompany(payload.societeId);
    return true;
  }
}
