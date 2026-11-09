import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TicketStore } from '../realtime/ticket.store';
import { NotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';
import type { PushService } from './push.service';

// Ticket du flux temps réel des notifications (09/11/2026) : émis pour la
// personne connectée (identité du jeton JWT, jamais de l'URL), marqué
// « notifications » — il n'ouvre pas le flux de la messagerie.

const USER = { userId: 'U1', societeId: 'S1', societeSlug: 'grey-concrete', role: 'Salarié' };

describe('NotificationsController.ticket', () => {
  let tickets: TicketStore;
  beforeEach(() => (tickets = new TicketStore()));
  afterEach(() => tickets.onModuleDestroy());

  const controleur = () => new NotificationsController({} as NotificationsService, {} as PushService, tickets);

  it('émet un ticket à l’identité de la personne connectée, pour le flux des notifications', () => {
    const { token } = controleur().ticket({ user: USER });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(tickets.consommer(token)).toEqual({ stream: 'notifications', ...USER });
  });

  it('ticket à usage unique : une seconde consommation est refusée', () => {
    const { token } = controleur().ticket({ user: USER });
    tickets.consommer(token);
    expect(tickets.consommer(token)).toBeNull();
  });

  it('deux demandes : deux tickets distincts', () => {
    const c = controleur();
    expect(c.ticket({ user: USER }).token).not.toBe(c.ticket({ user: USER }).token);
  });

  it('fréquence bornée : garde de limitation, 30 tickets par minute', () => {
    const route = NotificationsController.prototype.ticket;
    expect(Reflect.getMetadata(GUARDS_METADATA, route)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', route)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', route)).toBe(60_000);
  });
});
