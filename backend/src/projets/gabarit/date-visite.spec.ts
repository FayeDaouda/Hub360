import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { CARTE_RELEVES, lendemain, ProjetsOuvertsService } from './projets-ouverts.service';

// Règle du gabarit (carte « Relevés existants ») : chaque relevé est dû dans
// les 24 h calendaires qui suivent la visite, week-end compris.

describe('lendemain', () => {
  it.each([
    ['2026-10-14', '2026-10-15'],
    ['2026-10-17', '2026-10-18'], // samedi → dimanche : jours calendaires
    ['2026-10-31', '2026-11-01'],
    ['2026-12-31', '2027-01-01'],
  ])('%s → %s', (d, attendu) => {
    expect(lendemain(d)).toBe(attendu);
  });
});

describe('ProjetsOuvertsService.definirDateVisite', () => {
  function svc(projet: unknown) {
    const prisma = {
      projet: { findFirst: jest.fn().mockResolvedValue(projet), update: jest.fn((a: unknown) => a) },
      carteProjet: { updateMany: jest.fn((a: unknown) => a) },
      tacheProjet: { updateMany: jest.fn((a: unknown) => a) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const s = new ProjetsOuvertsService(prisma as unknown as PrismaService, {} as ReglagesService);
    return { s, prisma };
  }

  it('pose la date sur le projet et la fenêtre visite → lendemain sur la carte et ses tâches', async () => {
    const { s, prisma } = svc({ id: 'P1' });
    await s.definirDateVisite('S1', 'P1', '2026-10-17');
    expect(prisma.projet.update).toHaveBeenCalledWith({ where: { id: 'P1' }, data: { dateVisiteSite: '2026-10-17' } });
    const fenetre = { debutLe: '2026-10-17', finLe: '2026-10-18' };
    expect(prisma.carteProjet.updateMany).toHaveBeenCalledWith({ where: { projetId: 'P1', cle: CARTE_RELEVES }, data: fenetre });
    expect(prisma.tacheProjet.updateMany).toHaveBeenCalledWith({ where: { projetId: 'P1', carte: { cle: CARTE_RELEVES } }, data: fenetre });
  });

  it('effacer la date retire l’échéance', async () => {
    const { s, prisma } = svc({ id: 'P1' });
    await s.definirDateVisite('S1', 'P1', null);
    expect(prisma.tacheProjet.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { debutLe: null, finLe: null } }));
  });

  it('projet d’une autre société ou pas encore ouvert → 404, rien n’est modifié', async () => {
    const { s, prisma } = svc(null);
    await expect(s.definirDateVisite('S1', 'PX', '2026-10-17')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
