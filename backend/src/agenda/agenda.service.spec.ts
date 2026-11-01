import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AgendaService } from './agenda.service';

const svc = () => {
  const prisma = {
    utilisateurSocieteRole: { findMany: jest.fn().mockResolvedValue([{ utilisateurId: 'U2' }]) },
    utilisateur: {
      findUnique: jest.fn().mockResolvedValue({ id: 'U9', prenom: 'A', nom: 'B' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rendezVous: {
      create: jest.fn().mockResolvedValue({ id: 'R1', titre: 'Point' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tacheProjet: { findMany: jest.fn().mockResolvedValue([]) },
    demandeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifications = { envoyer: jest.fn() };
  const demandes = { aValider: jest.fn().mockResolvedValue([]) };
  return {
    s: new AgendaService(prisma as never, notifications as never, demandes as never),
    prisma,
    notifications,
    demandes,
  };
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

  it('une période d’un an au plus (vue Année) ; une semaine par défaut', async () => {
    const { s } = svc();
    await expect(s.semaine(moi({ agenda: 'L' }), '2026-01-01', undefined, '2027-01-02')).rejects.toThrow(
      BadRequestException,
    );
    expect((await s.semaine(moi({ agenda: 'L' }), '2026-01-01', undefined, '2026-12-31')).au).toBe('2026-12-31');
    expect((await s.semaine(moi({ agenda: 'L' }), '2026-11-02')).au).toBe('2026-11-08');
  });

  it('les demandes d’absence à trancher : un élément par jour couvert, sur son agenda seulement', async () => {
    const { s, demandes } = svc();
    demandes.aValider.mockResolvedValue([
      {
        id: 'D1',
        type: 'conge_paye',
        jours: 3,
        dateDebut: '2026-10-30',
        dateFin: '2026-11-03',
        validationFinale: false,
        salarie: { prenom: 'Awa', nom: 'Diop', poste: null },
      },
    ]);
    const vue = await s.semaine(moi({ agenda: 'L' }), '2026-11-02');
    expect(vue.elements.filter((e) => e.type === 'demande').map((e) => e.jour)).toEqual(['2026-11-02', '2026-11-03']);
    expect(vue.elements[0]).toMatchObject({ titre: 'Awa Diop', demande: { id: 'D1', validationFinale: false } });
    const autre = await s.semaine(moi({ agenda: 'L', 'agenda.autres': 'L' }), '2026-11-02', 'U9');
    expect(autre.elements).toEqual([]);
  });
});
