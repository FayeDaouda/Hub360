import type { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { NotificationsBus } from '../realtime/notifications.bus';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push') as { sendNotification: jest.Mock };

// Notifications système (02/11/2026) : chaque notification poussée une fois,
// selon les préférences et les heures calmes ; un appareil expiré est oublié.
describe('PushService.distribuer', () => {
  const abonnement = { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' };
  const monter = (preferences: unknown, type = 'absence_a_decider') => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    const prisma = {
      notification: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'N1', type, titre: 'Congé à décider', destinataireId: 'U1', societeId: 'S1' }]),
        updateMany: jest.fn(),
      },
      utilisateur: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'U1', preferencesNotifications: preferences, abonnementsPush: [abonnement] }]),
      },
      societe: { findMany: jest.fn().mockResolvedValue([{ id: 'S1', slug: 'gc' }]) },
      abonnementPush: { deleteMany: jest.fn() },
    } as unknown as PrismaService;
    const s = new PushService(prisma, new NotificationsBus());
    s.onModuleInit();
    return { s, prisma };
  };
  beforeEach(() => webpush.sendNotification.mockReset());

  it('pousse la notification avec son lien, et la marque une fois pour toutes', async () => {
    const { s, prisma } = monter(null);
    await s.distribuer();
    expect((prisma.notification.updateMany as jest.Mock).mock.calls[0][0].where).toEqual({ id: { in: ['N1'] } });
    const charge = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
    expect(charge).toEqual({
      titre: 'Décisions à prendre',
      corps: 'Congé à décider',
      url: '/admin/gc?notification=N1',
      tag: 'N1',
    });
  });

  it('catégorie coupée ou heures calmes : rien sur l’appareil', async () => {
    await monter({ categories: { decisions: { systeme: false } } }).s.distribuer();
    await monter({ calme: { actif: true, debut: '00:00', fin: '23:59' } }).s.distribuer();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('appareil expiré (410) : abonnement oublié', async () => {
    webpush.sendNotification.mockRejectedValue({ statusCode: 410 });
    const { s, prisma } = monter(null);
    await s.distribuer();
    expect(prisma.abonnementPush.deleteMany).toHaveBeenCalledWith({ where: { endpoint: abonnement.endpoint } });
  });
});

// Temps réel (09/11/2026) : un signal du bus déclenche la tournée ~200 ms
// après (regroupée), sans attendre l'intervalle de 5 s ; une tournée déjà en
// cours en appelle une autre juste après. Sans VAPID : aucun abonnement au bus.
describe('PushService · tournée déclenchée par le signal', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.useRealTimers();
  });

  const monter = (vapid = true) => {
    if (vapid) {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
    } else {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    }
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      notification: { findMany, updateMany: jest.fn() },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
      societe: { findMany: jest.fn().mockResolvedValue([]) },
      abonnementPush: { deleteMany: jest.fn() },
    } as unknown as PrismaService;
    const bus = new NotificationsBus();
    const s = new PushService(prisma, bus);
    s.onModuleInit();
    return { s, bus, findMany };
  };

  it('un signal lance la tournée 200 ms plus tard', () => {
    jest.useFakeTimers();
    const { s, bus } = monter();
    const distribuer = jest.spyOn(s, 'distribuer').mockResolvedValue();
    bus.signal('S1', ['U1']);
    jest.advanceTimersByTime(199);
    expect(distribuer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(distribuer).toHaveBeenCalledTimes(1);
    s.onModuleDestroy();
  });

  it('plusieurs signaux rapprochés : une seule tournée', () => {
    jest.useFakeTimers();
    const { s, bus } = monter();
    const distribuer = jest.spyOn(s, 'distribuer').mockResolvedValue();
    bus.signal('S1', ['U1']);
    jest.advanceTimersByTime(100);
    bus.signal('S1', ['U2']);
    bus.signal('S2', ['U3']);
    jest.advanceTimersByTime(500);
    expect(distribuer).toHaveBeenCalledTimes(1);
    // Signal suivant, après la tournée : une nouvelle tournée.
    bus.signal('S1', ['U4']);
    jest.advanceTimersByTime(200);
    expect(distribuer).toHaveBeenCalledTimes(2);
    s.onModuleDestroy();
  });

  it('lecture (« lue ») : aucune tournée déclenchée', () => {
    jest.useFakeTimers();
    const { s, bus } = monter();
    const distribuer = jest.spyOn(s, 'distribuer').mockResolvedValue();
    bus.signal('S1', ['U1'], 'read');
    jest.advanceTimersByTime(1_000);
    expect(distribuer).not.toHaveBeenCalled();
    s.onModuleDestroy();
  });

  it('tournée déjà en cours : une autre est relancée juste après, pas en parallèle', async () => {
    jest.useFakeTimers();
    const { s, findMany } = monter();
    let liberer!: (v: unknown[]) => void;
    findMany.mockReturnValueOnce(new Promise((r) => (liberer = r)));
    const premiere = s.distribuer();
    expect(findMany).toHaveBeenCalledTimes(1);
    // Intervalle (ou signal) pendant la tournée : pas de seconde lecture.
    await s.distribuer();
    expect(findMany).toHaveBeenCalledTimes(1);
    liberer([]);
    await premiere;
    expect(findMany).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    expect(findMany).toHaveBeenCalledTimes(2);
    s.onModuleDestroy();
  });

  it('sans tournée concurrente : pas de relance inutile', async () => {
    jest.useFakeTimers();
    const { s, findMany } = monter();
    await s.distribuer();
    jest.advanceTimersByTime(10_000);
    expect(findMany).toHaveBeenCalledTimes(1);
    s.onModuleDestroy();
  });

  it('clés VAPID absentes : le signal ne déclenche rien (pas d’abonnement au bus)', () => {
    jest.useFakeTimers();
    const { s, bus } = monter(false);
    const distribuer = jest.spyOn(s, 'distribuer').mockResolvedValue();
    const tous = jest.spyOn(bus, 'all');
    s.onModuleInit();
    bus.signal('S1', ['U1']);
    jest.advanceTimersByTime(1_000);
    expect(tous).not.toHaveBeenCalled();
    expect(distribuer).not.toHaveBeenCalled();
    expect(s.clePublique()).toBeNull();
  });

  it('arrêt du module : la tournée planifiée est annulée et le bus n’est plus écouté', () => {
    jest.useFakeTimers();
    const { s, bus } = monter();
    const distribuer = jest.spyOn(s, 'distribuer').mockResolvedValue();
    bus.signal('S1', ['U1']);
    s.onModuleDestroy();
    jest.advanceTimersByTime(1_000);
    bus.signal('S1', ['U2']);
    jest.advanceTimersByTime(1_000);
    expect(distribuer).not.toHaveBeenCalled();
  });
});
