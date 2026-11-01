import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AgendaService } from './agenda.service';

const svc = () => {
  const prisma = {
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }]) },
    rendezVous: { create: jest.fn().mockResolvedValue({ id: 'R1', titre: 'Point' }) },
    utilisateur: { findUnique: jest.fn().mockResolvedValue({ id: 'U9', prenom: 'A', nom: 'B' }) },
  };
  const notifications = { envoyer: jest.fn() };
  return { s: new AgendaService(prisma as never, notifications as never), prisma, notifications };
};
const moi = (permissions: Record<string, string>) => ({ userId: 'U1', societeId: 'S1', role: 'Salarié', permissions });
const rdv = { titre: 'Point', debut: '2026-11-03T10:00:00.000Z', fin: '2026-11-03T11:00:00.000Z' };

// Agenda (lot 11, 01/11/2026).
describe('AgendaService', () => {
  it('la fin doit suivre le début', async () => {
    await expect(svc().s.creer(moi({ agenda: 'LES' }), { ...rdv, fin: rdv.debut })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('inviter demande l’Écriture de « Réunions » ; avec elle, les invités sont prévenus', async () => {
    await expect(svc().s.creer(moi({ agenda: 'LES' }), { ...rdv, inviteIds: ['U2'] })).rejects.toThrow(
      ForbiddenException,
    );
    const { s, notifications } = svc();
    await s.creer(moi({ agenda: 'LES', 'agenda.reunions': 'E' }), { ...rdv, inviteIds: ['U2'] });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rdv_invitation', destinataireIds: ['U2'] }),
    );
  });

  it('l’agenda d’un collègue demande la Lecture de « Agenda des autres »', async () => {
    await expect(svc().s.semaine(moi({ agenda: 'L' }), '2026-11-02', 'U9')).rejects.toThrow(ForbiddenException);
  });
});
