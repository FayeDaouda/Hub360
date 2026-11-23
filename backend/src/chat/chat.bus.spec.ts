import type { MessageEvent } from '@nestjs/common';
import { TypeCanal } from '@prisma/client';
import { STREAM_LIFETIME_MS } from '../realtime/notifications.bus';
import { ChatBus } from './chat.bus';

const ABONNE = { userId: 'U1', societeId: 'S1', role: 'salarie', celluleId: null };
const MESSAGE = {
  kind: 'message' as const,
  societeId: 'S1',
  canalId: 'C1',
  canalType: TypeCanal.general,
  celluleId: null,
  participant1Id: null,
  participant2Id: null,
  membreIds: [],
  data: { id: 'M1' },
};

// Audit du 23/11/2026 : le flux du chat a une durée de vie, comme celui des
// notifications — sinon un compte désactivé ou déconnecté partout continue
// de recevoir les messages tant que son onglet reste ouvert.
describe('ChatBus · durée de vie du flux', () => {
  afterEach(() => jest.useRealTimers());

  it('se termine après 15 min ; plus rien n’arrive ensuite', () => {
    jest.useFakeTimers();
    const bus = new ChatBus();
    const recus: MessageEvent[] = [];
    const termine = jest.fn();
    bus.pour(ABONNE).subscribe({ next: (e) => recus.push(e), complete: termine });

    jest.advanceTimersByTime(STREAM_LIFETIME_MS - 1);
    expect(termine).not.toHaveBeenCalled();
    bus.publier(MESSAGE);
    expect(recus.filter((e) => e.type !== 'ping')).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(termine).toHaveBeenCalledTimes(1);
    const avant = recus.length;
    bus.publier(MESSAGE);
    jest.advanceTimersByTime(60_000);
    expect(recus).toHaveLength(avant);
  });

  it('ne reçoit pas les messages d’une autre société', () => {
    const bus = new ChatBus();
    const recus: MessageEvent[] = [];
    const abonnement = bus.pour(ABONNE).subscribe((e) => recus.push(e));
    bus.publier({ ...MESSAGE, societeId: 'S2' });
    expect(recus).toHaveLength(0);
    abonnement.unsubscribe();
  });
});
