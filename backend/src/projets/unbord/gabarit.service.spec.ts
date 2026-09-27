import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UnbordGabaritService } from './gabarit.service';

function mockPrisma(opts: { ligne?: unknown; max?: number | null } = {}) {
  const findFirst = jest.fn().mockResolvedValue(opts.ligne ?? null);
  const create = jest.fn().mockResolvedValue({});
  const update = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockResolvedValue([]);
  const aggregate = jest.fn().mockResolvedValue({ _max: { ordre: opts.max ?? null } });
  const prisma = {
    ligneUnbordGabarit: { findFirst, create, update, updateMany, findMany, aggregate },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { prisma, findFirst, create, update, updateMany, findMany, aggregate };
}

describe('UnbordGabaritService.creer', () => {
  it('premier item de la société (aucun max encore) → ordre 0', async () => {
    const { prisma, create } = mockPrisma({ max: null });
    const svc = new UnbordGabaritService(prisma);
    await svc.creer('S1', { groupe: 'documents' as never, libelle: 'Nouveau papier' });
    expect(create).toHaveBeenCalledWith({
      data: { societeId: 'S1', groupe: 'documents', libelle: 'Nouveau papier', ordre: 0 },
    });
  });

  it('ajout après des items existants → ordre = max + 1', async () => {
    const { prisma, create } = mockPrisma({ max: 4 });
    const svc = new UnbordGabaritService(prisma);
    await svc.creer('S1', { groupe: 'releve_existant' as never, libelle: 'Autre' });
    expect(create).toHaveBeenCalledWith({
      data: { societeId: 'S1', groupe: 'releve_existant', libelle: 'Autre', ordre: 5 },
    });
  });
});

describe('UnbordGabaritService.renommer / supprimer', () => {
  it('item introuvable pour cette société → 404, rien modifié', async () => {
    const { prisma, update } = mockPrisma({ ligne: null });
    const svc = new UnbordGabaritService(prisma);
    await expect(svc.renommer('S1', 'INEXISTANT', { libelle: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('item d’une AUTRE société → 404 (trouver() filtre par societeId)', async () => {
    const { prisma, findFirst, update } = mockPrisma({ ligne: null });
    const svc = new UnbordGabaritService(prisma);
    await expect(svc.supprimer('S1', 'G1', 'U1')).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'G1', societeId: 'S1', supprimeLe: null },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : renomme un item de sa propre société', async () => {
    const { prisma, update } = mockPrisma({ ligne: { id: 'G1', societeId: 'S1' } });
    const svc = new UnbordGabaritService(prisma);
    await svc.renommer('S1', 'G1', { libelle: 'Nouveau nom' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'G1' }, data: { libelle: 'Nouveau nom' } });
  });

  it('AUTORISÉ : suppression douce pose supprimeLe/supprimeParId, ne supprime pas la ligne', async () => {
    const { prisma, update } = mockPrisma({ ligne: { id: 'G1', societeId: 'S1' } });
    const svc = new UnbordGabaritService(prisma);
    await svc.supprimer('S1', 'G1', 'U1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'G1' },
      data: { supprimeLe: expect.any(Date), supprimeParId: 'U1' },
    });
  });
});

describe('UnbordGabaritService.reordonner', () => {
  it('la position dans le tableau devient l’ordre — scopé à la société (updateMany where id+societeId)', async () => {
    const { prisma, updateMany } = mockPrisma();
    const svc = new UnbordGabaritService(prisma);
    await svc.reordonner('S1', { ids: ['G2', 'G1', 'G3'] });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'G2', societeId: 'S1' },
      data: { ordre: 0 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'G1', societeId: 'S1' },
      data: { ordre: 1 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: 'G3', societeId: 'S1' },
      data: { ordre: 2 },
    });
  });
});
