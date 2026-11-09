import type { MessageEvent } from '@nestjs/common';
import { STREAM_LIFETIME_MS, NotificationsBus, NotificationSignal } from './notifications.bus';

// Signal temps réel des notifications (09/11/2026) : sans contenu, dédoublonné,
// et chacun ne reçoit que SES signaux, dans SA société ; un battement tient la
// connexion SSE à travers les proxys.

function ecouter(bus: NotificationsBus, userId: string, societeId: string) {
  const recus: MessageEvent[] = [];
  const abonnement = bus.forUser(userId, societeId).subscribe((e) => recus.push(e));
  return { recus, fermer: () => abonnement.unsubscribe() };
}

describe('NotificationsBus.signal / all', () => {
  it('relaie le signal avec ses destinataires, sans doublon', () => {
    const bus = new NotificationsBus();
    const recus: NotificationSignal[] = [];
    bus.all().subscribe((s) => recus.push(s));
    bus.signal('S1', ['U1', 'U2', 'U1']);
    expect(recus).toEqual([{ societeId: 'S1', destinataireIds: ['U1', 'U2'], kind: 'new' }]);
  });

  it('accepte tout itérable (un Set de destinataires)', () => {
    const bus = new NotificationsBus();
    const recus: NotificationSignal[] = [];
    bus.all().subscribe((s) => recus.push(s));
    bus.signal('S1', new Set(['U3']));
    expect(recus).toEqual([{ societeId: 'S1', destinataireIds: ['U3'], kind: 'new' }]);
  });

  it('nature « lue » transmise telle quelle (compteurs seulement)', () => {
    const bus = new NotificationsBus();
    const recus: NotificationSignal[] = [];
    bus.all().subscribe((s) => recus.push(s));
    bus.signal('S1', ['U1'], 'read');
    expect(recus).toEqual([{ societeId: 'S1', destinataireIds: ['U1'], kind: 'read' }]);
  });

  it('liste vide : aucun signal émis', () => {
    const bus = new NotificationsBus();
    const recu = jest.fn();
    bus.all().subscribe(recu);
    bus.signal('S1', []);
    expect(recu).not.toHaveBeenCalled();
  });

  it('all() voit les signaux de toutes les sociétés (tournée des notifications système)', () => {
    const bus = new NotificationsBus();
    const recus: string[] = [];
    bus.all().subscribe((s) => recus.push(s.societeId));
    bus.signal('S1', ['U1']);
    bus.signal('S2', ['U9']);
    expect(recus).toEqual(['S1', 'S2']);
  });
});

describe('NotificationsBus.forUser', () => {
  afterEach(() => jest.useRealTimers());

  it('reçoit un événement « notification » sans contenu quand il est destinataire', () => {
    const bus = new NotificationsBus();
    const { recus, fermer } = ecouter(bus, 'U1', 'S1');
    bus.signal('S1', ['U2', 'U1']);
    expect(recus).toEqual([{ type: 'notification', data: {} }]);
    fermer();
  });

  it('ne reçoit pas les signaux des autres utilisateurs', () => {
    const bus = new NotificationsBus();
    const { recus, fermer } = ecouter(bus, 'U1', 'S1');
    bus.signal('S1', ['U2', 'U3']);
    expect(recus).toEqual([]);
    fermer();
  });

  it('ne reçoit pas ses signaux d’une autre société (isolation entre sociétés)', () => {
    const bus = new NotificationsBus();
    const { recus, fermer } = ecouter(bus, 'U1', 'S1');
    bus.signal('S2', ['U1']);
    expect(recus).toEqual([]);
    fermer();
  });

  it('plusieurs écrans de la même personne reçoivent chacun le signal', () => {
    const bus = new NotificationsBus();
    const onglet1 = ecouter(bus, 'U1', 'S1');
    const onglet2 = ecouter(bus, 'U1', 'S1');
    bus.signal('S1', ['U1']);
    expect(onglet1.recus).toHaveLength(1);
    expect(onglet2.recus).toHaveLength(1);
    onglet1.fermer();
    onglet2.fermer();
  });

  it('une lecture (« lue ») relit aussi la cloche : même événement « notification »', () => {
    const bus = new NotificationsBus();
    const { recus, fermer } = ecouter(bus, 'U1', 'S1');
    bus.signal('S1', ['U1'], 'read');
    expect(recus).toEqual([{ type: 'notification', data: {} }]);
    fermer();
  });

  it('le flux se termine après 15 min (reconnexion avec un ticket frais)', () => {
    jest.useFakeTimers();
    expect(STREAM_LIFETIME_MS).toBe(15 * 60_000);
    const bus = new NotificationsBus();
    const recus: MessageEvent[] = [];
    const termine = jest.fn();
    bus.forUser('U1', 'S1').subscribe({ next: (e) => recus.push(e), complete: termine });
    jest.advanceTimersByTime(STREAM_LIFETIME_MS - 1);
    expect(termine).not.toHaveBeenCalled();
    bus.signal('S1', ['U1']);
    expect(recus.filter((e) => e.type === 'notification')).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(termine).toHaveBeenCalledTimes(1);
    const avant = recus.length;
    bus.signal('S1', ['U1']);
    jest.advanceTimersByTime(60_000);
    expect(recus).toHaveLength(avant); // ni signal ni battement après la fin
  });

  it('émet un battement « ping » toutes les 25 s, et plus rien une fois fermé', () => {
    jest.useFakeTimers();
    const bus = new NotificationsBus();
    const { recus, fermer } = ecouter(bus, 'U1', 'S1');
    jest.advanceTimersByTime(24_999);
    expect(recus).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(recus).toEqual([{ type: 'ping', data: {} }]);
    jest.advanceTimersByTime(25_000);
    expect(recus).toHaveLength(2);
    fermer();
    jest.advanceTimersByTime(100_000);
    expect(recus).toHaveLength(2);
  });
});
