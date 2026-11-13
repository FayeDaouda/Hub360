import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant } from '../tenancy/tenant-context';
import { RappelsAgendaService } from './rappels.service';

// Rappels des rendez-vous (12/11/2026).
const MAINTENANT = new Date('2026-11-13T08:45:00.000Z');

const monter = (candidats: { id: string; societeId: string; debut: Date; rappelMinutes: number }[]) => {
  const prisma = {
    rendezVous: {
      findMany: jest.fn().mockResolvedValue(candidats),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        titre: 'Point chantier',
        debut: new Date('2026-11-13T09:00:00.000Z'),
        lieu: 'Plateau',
        organisateurId: 'U1',
        invites: [
          { utilisateurId: 'U2', reponse: 'oui' },
          { utilisateurId: 'U3', reponse: 'non' },
          { utilisateurId: 'U4', reponse: null },
        ],
      }),
    },
    // Membres actifs de la société : tous ceux demandés, par défaut.
    utilisateurSocieteRole: {
      findMany: jest.fn(({ where }: { where: { utilisateurId: { in: string[] } } }) =>
        Promise.resolve(where.utilisateurId.in.map((utilisateurId) => ({ utilisateurId }))),
      ),
    },
  };
  const notifications = { envoyer: jest.fn().mockResolvedValue(3) };
  return { s: new RappelsAgendaService(prisma as never, notifications as never), prisma, notifications };
};

describe('RappelsAgendaService', () => {
  it('l’heure du rappel venue : organisateur et invités prévenus, sauf ceux qui ont décliné', async () => {
    const { s, prisma, notifications } = monter([
      { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
    ]);
    expect(await s.tourner(MAINTENANT)).toBe(1);
    expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: 'R1', rappelEnvoyeLe: null, annuleLe: null },
      data: { rappelEnvoyeLe: MAINTENANT },
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        societeId: 'S1',
        type: 'rdv_rappel',
        destinataireIds: ['U1', 'U2', 'U4'],
        titre: expect.stringContaining('Rappel · Point chantier'),
      }),
    );
  });

  it('pas encore l’heure : rien ; déjà pris par une autre tournée : rien', async () => {
    const tot = monter([{ id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 10 }]);
    expect(await tot.s.tourner(MAINTENANT)).toBe(0);
    expect(tot.prisma.rendezVous.updateMany).not.toHaveBeenCalled();
    const pris = monter([
      { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
    ]);
    pris.prisma.rendezVous.updateMany.mockResolvedValue({ count: 0 });
    expect(await pris.s.tourner(MAINTENANT)).toBe(0);
    expect(pris.notifications.envoyer).not.toHaveBeenCalled();
  });

  it('cherche les rendez-vous à venir dans les 24 h, rappel demandé et pas encore envoyé', async () => {
    const { s, prisma } = monter([]);
    await s.tourner(MAINTENANT);
    expect(prisma.rendezVous.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          annuleLe: null,
          rappelEnvoyeLe: null,
          rappelMinutes: { not: null },
          debut: { gt: MAINTENANT, lte: new Date(+MAINTENANT + 1440 * 60_000) },
        },
      }),
    );
  });
  // Isolation entre sociétés (ADR 0001) : découverte en système, envoi dans sa société.
  describe('plusieurs sociétés', () => {
    const DEBUT = new Date('2026-11-13T09:00:00.000Z');

    it('la recherche tourne en périmètre système, nommé', async () => {
      const { s, prisma } = monter([]);
      let contexte: unknown;
      prisma.rendezVous.findMany.mockImplementation(async () => {
        contexte = currentTenant();
        return [];
      });
      await s.tourner(MAINTENANT);
      expect(contexte).toEqual({ scope: 'system', reason: expect.stringContaining('rappels') });
    });

    it('chaque rappel est pris, relu et notifié dans la société de son rendez-vous', async () => {
      const { s, prisma, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: DEBUT, rappelMinutes: 30 },
        { id: 'R2', societeId: 'S2', debut: DEBUT, rappelMinutes: 60 },
      ]);
      const vus: Record<string, unknown[]> = { prendre: [], relire: [], notifier: [] };
      prisma.rendezVous.updateMany.mockImplementation(async () => {
        vus.prendre.push(currentTenant());
        return { count: 1 };
      });
      const relire = prisma.rendezVous.findUnique.getMockImplementation()!;
      prisma.rendezVous.findUnique.mockImplementation(async (...args: unknown[]) => {
        vus.relire.push(currentTenant());
        return relire(...args);
      });
      notifications.envoyer.mockImplementation(async () => {
        vus.notifier.push(currentTenant());
        return 1;
      });

      expect(await s.tourner(MAINTENANT)).toBe(2);
      for (const etape of ['prendre', 'relire', 'notifier']) {
        expect(vus[etape]).toEqual([
          { scope: 'company', companyId: 'S1' },
          { scope: 'company', companyId: 'S2' },
        ]);
      }
      expect(notifications.envoyer.mock.calls.map((c) => c[0].societeId)).toEqual(['S1', 'S2']);
    });

    it('un rendez-vous pas encore à l’heure n’empêche pas l’envoi des autres', async () => {
      const { s, prisma, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: DEBUT, rappelMinutes: 10 }, // 08:50 : trop tôt
        { id: 'R2', societeId: 'S2', debut: DEBUT, rappelMinutes: 30 }, // 08:30 : passé
      ]);
      expect(await s.tourner(MAINTENANT)).toBe(1);
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.rendezVous.updateMany.mock.calls[0][0].where.id).toBe('R2');
      expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ societeId: 'S2' }));
    });
  });

  describe('délais', () => {
    it('la veille : le rappel part 24 h avant, pas une minute plus tôt', async () => {
      const debut = new Date(+MAINTENANT + 1440 * 60_000);
      const pile = monter([{ id: 'R1', societeId: 'S1', debut, rappelMinutes: 1440 }]);
      expect(await pile.s.tourner(MAINTENANT)).toBe(1);
      const avant = monter([{ id: 'R1', societeId: 'S1', debut, rappelMinutes: 1440 }]);
      expect(await avant.s.tourner(new Date(+MAINTENANT - 60_000))).toBe(0);
      expect(avant.prisma.rendezVous.updateMany).not.toHaveBeenCalled();
    });

    it('pile à l’heure du rappel : envoyé', async () => {
      const { s } = monter([
        { id: 'R1', societeId: 'S1', debut: new Date(+MAINTENANT + 10 * 60_000), rappelMinutes: 10 },
      ]);
      expect(await s.tourner(MAINTENANT)).toBe(1);
    });

    it('une tournée en retard rattrape un rappel dont l’heure est passée, tant que la réunion n’a pas commencé', async () => {
      const { s } = monter([{ id: 'R1', societeId: 'S1', debut: new Date(+MAINTENANT + 60_000), rappelMinutes: 60 }]);
      expect(await s.tourner(MAINTENANT)).toBe(1);
    });
  });

  describe('contenu', () => {
    it('le titre donne la réunion, le jour, l’heure et le lieu', async () => {
      const { s, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
      ]);
      await s.tourner(MAINTENANT);
      expect(notifications.envoyer.mock.calls[0][0].titre).toBe(
        'Rappel · Point chantier · vendredi 13 novembre à 09:00 · Plateau',
      );
    });

    it('sans lieu, le titre s’arrête à l’heure', async () => {
      const { s, prisma, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
      ]);
      const relire = prisma.rendezVous.findUnique.getMockImplementation()!;
      prisma.rendezVous.findUnique.mockImplementation(async (...args: unknown[]) => ({
        ...(await relire(...args)),
        lieu: null,
      }));
      await s.tourner(MAINTENANT);
      expect(notifications.envoyer.mock.calls[0][0].titre).toBe(
        'Rappel · Point chantier · vendredi 13 novembre à 09:00',
      );
    });

    it('rendez-vous disparu entre la prise et la relecture : rien n’est envoyé', async () => {
      const { s, prisma, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
      ]);
      prisma.rendezVous.findUnique.mockResolvedValue(null);
      expect(await s.tourner(MAINTENANT)).toBe(0);
      expect(notifications.envoyer).not.toHaveBeenCalled();
    });

    it('sans invité, l’organisateur seul est prévenu', async () => {
      const { s, prisma, notifications } = monter([
        { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
      ]);
      prisma.rendezVous.findUnique.mockResolvedValue({
        titre: 'Seul',
        debut: new Date('2026-11-13T09:00:00.000Z'),
        lieu: null,
        organisateurId: 'U1',
        invites: [],
      });
      await s.tourner(MAINTENANT);
      expect(notifications.envoyer.mock.calls[0][0].destinataireIds).toEqual(['U1']);
    });
  });
  // Piège du 09/11 (#97) : un service sans dépendances injectées casse en
  // production seulement. Nest doit lui fournir Prisma et les notifications.
  it('Nest injecte Prisma et les notifications dans le service', async () => {
    const { prisma, notifications } = monter([
      { id: 'R1', societeId: 'S1', debut: new Date('2026-11-13T09:00:00.000Z'), rappelMinutes: 30 },
    ]);
    const module = await Test.createTestingModule({
      providers: [
        RappelsAgendaService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    expect(await module.get(RappelsAgendaService).tourner(MAINTENANT)).toBe(1);
    expect(notifications.envoyer).toHaveBeenCalledTimes(1);
  });

  // Fiabilité (relecture du 13/11/2026).
  describe('fiabilité', () => {
    const R = (id: string, societeId = 'S1') => ({
      id,
      societeId,
      debut: new Date('2026-11-13T09:00:00.000Z'),
      rappelMinutes: 30,
    });

    it('l’envoi échoue (0 notification) : le rappel est rendu pour la tournée suivante', async () => {
      const { s, prisma, notifications } = monter([R('R1')]);
      notifications.envoyer.mockResolvedValue(0);
      expect(await s.tourner(MAINTENANT)).toBe(0);
      expect(prisma.rendezVous.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'R1', rappelEnvoyeLe: MAINTENANT },
        data: { rappelEnvoyeLe: null },
      });
    });

    it('une erreur sur un rendez-vous n’empêche pas les suivants, et le rend', async () => {
      const { s, prisma, notifications } = monter([R('R1'), R('R2', 'S2')]);
      prisma.rendezVous.findUnique.mockRejectedValueOnce(new Error('base indisponible'));
      expect(await s.tourner(MAINTENANT)).toBe(1);
      expect(notifications.envoyer).toHaveBeenCalledTimes(1);
      expect(prisma.rendezVous.updateMany).toHaveBeenCalledWith({
        where: { id: 'R1', rappelEnvoyeLe: MAINTENANT },
        data: { rappelEnvoyeLe: null },
      });
    });

    it('seuls les membres actifs de la société sont prévenus ; plus personne : rien, sans reprise', async () => {
      const { s, prisma, notifications } = monter([R('R1')]);
      prisma.utilisateurSocieteRole.findMany.mockResolvedValueOnce([{ utilisateurId: 'U1' }]);
      await s.tourner(MAINTENANT);
      expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ destinataireIds: ['U1'] }));
      const vide = monter([R('R1')]);
      vide.prisma.utilisateurSocieteRole.findMany.mockResolvedValueOnce([]);
      expect(await vide.s.tourner(MAINTENANT)).toBe(0);
      expect(vide.notifications.envoyer).not.toHaveBeenCalled();
      expect(vide.prisma.rendezVous.updateMany).toHaveBeenCalledTimes(1); // la prise, pas de reprise
    });

    it('une seule tournée à la fois', async () => {
      const { s, prisma } = monter([R('R1')]);
      let liberer!: () => void;
      prisma.rendezVous.findMany.mockReturnValueOnce(new Promise((ok) => (liberer = () => ok([]))));
      const premiere = s.tourner(MAINTENANT);
      expect(await s.tourner(MAINTENANT)).toBe(0);
      liberer();
      await premiere;
      expect(prisma.rendezVous.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
