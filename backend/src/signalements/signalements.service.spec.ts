import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignalementsService } from './signalements.service';

function svc() {
  const create = jest.fn().mockResolvedValue({ id: 'S9' });
  const prisma = { signalement: { create } } as unknown as PrismaService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['CIO1']) };
  return { s: new SignalementsService(prisma, notifications as unknown as NotificationsService), create, notifications };
}
const acteur = { userId: 'U1', societeId: 'S1', role: 'Salarié' };

describe('SignalementsService.creer', () => {
  it('joint le rôle de l’auteur et prévient le CIO', async () => {
    const { s, create, notifications } = svc();
    await s.creer(acteur, { description: '  Le bouton Remettre ne répond pas  ', page: '/admin/gc/mon-espace', appareil: 'mobile' });
    expect(create.mock.calls[0][0].data).toMatchObject({ role: 'Salarié', description: 'Le bouton Remettre ne répond pas', appareil: 'mobile', capture: null });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'signalement_recu', destinataireIds: ['CIO1'] }));
  });

  it('refuse une description vide et une capture qui n’est pas une image', async () => {
    const { s } = svc();
    await expect(s.creer(acteur, { description: '          ', page: '/', appareil: 'ordinateur' })).rejects.toThrow(BadRequestException);
    await expect(
      s.creer(acteur, { description: 'Problème de chargement', page: '/', appareil: 'ordinateur', capture: 'data:application/pdf;base64,AA' }),
    ).rejects.toThrow('image');
  });
});
