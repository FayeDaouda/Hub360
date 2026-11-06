import type { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

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
    const s = new PushService(prisma);
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
