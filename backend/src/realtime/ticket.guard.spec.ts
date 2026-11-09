import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RealtimeModule } from './realtime.module';
import { TicketStore, TicketPayload } from './ticket.store';
import { TicketGuard, TicketNotificationsGuard } from './ticket.guard';

// Garde du flux SSE : le ticket est à usage unique (consommé par le store,
// pas juste lu) et doit avoir été émis pour LE slug de l'URL — un ticket
// valide mais d'une autre société ne doit pas ouvrir le flux.

const PAYLOAD: TicketPayload = {
  stream: 'chat',
  userId: 'U1',
  societeId: 'S1',
  societeSlug: 'grey',
  role: 'collaborateur',
};

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

function store(payload: TicketPayload | null) {
  const consommer = jest.fn().mockReturnValue(payload);
  return { svc: { consommer } as unknown as TicketStore, consommer };
}

const req = (o: Partial<{ query: { token?: string }; params: { slug?: string } }> = {}) => ({
  query: { token: 'TOK1' },
  params: { slug: 'grey' },
  ...o,
});

describe('TicketGuard', () => {
  it('AUTORISÉ : ticket valide pour ce slug, consommé une seule fois, et posé sur la requête', () => {
    const { svc, consommer } = store(PAYLOAD);
    const request = req();
    expect(new TicketGuard(svc).canActivate(ctxOf(request))).toBe(true);
    expect(consommer).toHaveBeenCalledWith('TOK1');
    expect((request as { ticket?: TicketPayload }).ticket).toBe(PAYLOAD);
  });

  it('token absent de la query → 401, sans appeler le store', () => {
    const { svc, consommer } = store(PAYLOAD);
    expect(() => new TicketGuard(svc).canActivate(ctxOf(req({ query: {} })))).toThrow(UnauthorizedException);
    expect(consommer).not.toHaveBeenCalled();
  });

  it('ticket inconnu ou déjà consommé (store renvoie null) → 401', () => {
    const { svc } = store(null);
    expect(() => new TicketGuard(svc).canActivate(ctxOf(req()))).toThrow(UnauthorizedException);
  });

  it('HORS PÉRIMÈTRE : ticket valide mais émis pour un autre slug → 401', () => {
    const { svc } = store({ ...PAYLOAD, societeSlug: 'autre' });
    expect(() => new TicketGuard(svc).canActivate(ctxOf(req()))).toThrow(UnauthorizedException);
  });
});

// 09/11/2026 : un ticket n'ouvre que le flux pour lequel il a été émis — le
// ticket « notifications » (tout membre) n'ouvre pas la messagerie.
describe('Tickets par flux', () => {
  it('ticket « notifications » refusé par le flux de la messagerie → 401', () => {
    const { svc } = store({ ...PAYLOAD, stream: 'notifications' });
    expect(() => new TicketGuard(svc).canActivate(ctxOf(req()))).toThrow(UnauthorizedException);
  });

  it('ticket « chat » refusé par le flux des notifications → 401', () => {
    const { svc } = store(PAYLOAD);
    expect(() => new TicketNotificationsGuard(svc).canActivate(ctxOf(req()))).toThrow(UnauthorizedException);
  });

  it('ticket « notifications » accepté par le flux des notifications', () => {
    const { svc } = store({ ...PAYLOAD, stream: 'notifications' });
    expect(new TicketNotificationsGuard(svc).canActivate(ctxOf(req()))).toBe(true);
  });
});

// Non-régression (09/11/2026) : les gardes résolues par l'injection de Nest
// (et non créées à la main) reçoivent bien le TicketStore — sans quoi le flux
// répondait 500 en production.
describe('Gardes de ticket résolues par Nest', () => {
  it('TicketGuard et TicketNotificationsGuard reçoivent le TicketStore', async () => {
    const module = await Test.createTestingModule({ imports: [RealtimeModule] }).compile();
    const tickets = module.get(TicketStore);
    const chat = tickets.emettre({ ...PAYLOAD, stream: 'chat' });
    const notif = tickets.emettre({ ...PAYLOAD, stream: 'notifications' });
    expect(module.get(TicketGuard).canActivate(ctxOf(req({ query: { token: chat } })))).toBe(true);
    expect(module.get(TicketNotificationsGuard).canActivate(ctxOf(req({ query: { token: notif } })))).toBe(true);
    await module.close();
  });
});
