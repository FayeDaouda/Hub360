import { INestApplication } from '@nestjs/common';
import { get, type IncomingMessage } from 'http';
import type { AddressInfo } from 'net';
import { api, COMPTES, connecter, demarrer, SLUG } from './app';

// Flux temps réel (23/11/2026) : en production, les deux flux répondaient
// 500 depuis le 09/11 (gardes de ticket sans TicketStore injecté) et aucun
// test ne passait par leur vraie route. Ici : ticket demandé avec le jeton,
// puis le flux ouvert avec lui — 200 en text/event-stream ; ticket rejoué,
// d'un autre flux ou absent : 401.
let app: INestApplication;
let base: string;

// Ouvre le flux, lit le statut et l'en-tête, puis coupe (un flux ne finit pas).
function ouvrir(chemin: string): Promise<{ statut: number; type: string }> {
  return new Promise((ok, ko) => {
    const r = get(`${base}${chemin}`, (res: IncomingMessage) => {
      ok({ statut: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? '') });
      res.destroy();
    });
    r.on('error', (e: NodeJS.ErrnoException) => (e.code === 'ECONNRESET' ? undefined : ko(e)));
  });
}

beforeAll(async () => {
  app = await demarrer();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(() => app.close());

describe('Flux temps réel (SSE)', () => {
  it.each([
    ['notifications', '/notifications/ticket', '/notifications/flux'],
    ['messagerie', '/chat/ticket', '/chat/flux'],
  ])('%s : un ticket frais ouvre le flux, rejoué il est refusé', async (_nom, ticket, flux) => {
    const jeton = await connecter(app, COMPTES.salarie);
    const { body } = await api(app, jeton).post(ticket).expect(201);
    const chemin = `/api/societes/${SLUG}${flux}?token=${encodeURIComponent(body.token)}`;

    const premier = await ouvrir(chemin);
    expect(premier.statut).toBe(200);
    expect(premier.type).toContain('text/event-stream');
    // Usage unique.
    expect((await ouvrir(chemin)).statut).toBe(401);
  });

  it('refuse un flux sans ticket, et un ticket de l’autre flux', async () => {
    expect((await ouvrir(`/api/societes/${SLUG}/chat/flux`)).statut).toBe(401);
    const jeton = await connecter(app, COMPTES.salarie);
    const { body } = await api(app, jeton).post('/notifications/ticket').expect(201);
    expect((await ouvrir(`/api/societes/${SLUG}/chat/flux?token=${encodeURIComponent(body.token)}`)).statut).toBe(401);
  });
});
