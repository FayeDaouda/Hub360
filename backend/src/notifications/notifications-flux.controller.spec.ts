import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { MessageEvent } from '@nestjs/common';
import { NotificationsBus } from '../realtime/notifications.bus';
import { TicketGuard, TicketNotificationsGuard } from '../realtime/ticket.guard';
import type { TicketPayload } from '../realtime/ticket.store';
import { NotificationsFluxController } from './notifications-flux.controller';

// Flux SSE des notifications (09/11/2026) : l'identité vient du TICKET
// (consommé par la garde), jamais de l'URL ; la garde est celle des tickets
// « notifications », pas celle du chat.

const TICKET: TicketPayload = {
  stream: 'notifications',
  userId: 'U1',
  societeId: 'S1',
  societeSlug: 'grey-concrete',
  role: 'Salarié',
};

describe('NotificationsFluxController', () => {
  it('délègue au bus avec l’utilisateur et la société du ticket', () => {
    const bus = new NotificationsBus();
    const pour = jest.spyOn(bus, 'forUser');
    new NotificationsFluxController(bus).flux({ ticket: TICKET });
    expect(pour).toHaveBeenCalledWith('U1', 'S1');
  });

  it('relaie les signaux de la personne du ticket, pas ceux des autres', () => {
    const bus = new NotificationsBus();
    const recus: MessageEvent[] = [];
    const abonnement = new NotificationsFluxController(bus).flux({ ticket: TICKET }).subscribe((e) => recus.push(e));
    bus.signal('S1', ['U2']);
    bus.signal('S2', ['U1']);
    bus.signal('S1', ['U1']);
    expect(recus).toEqual([{ type: 'notification', data: {} }]);
    abonnement.unsubscribe();
  });

  it('protégé par la garde des tickets « notifications » (pas celle du chat)', () => {
    const gardes = Reflect.getMetadata(GUARDS_METADATA, NotificationsFluxController.prototype.flux) as unknown[];
    expect(gardes).toEqual([TicketNotificationsGuard]);
    expect(gardes).not.toContain(TicketGuard);
  });
});
