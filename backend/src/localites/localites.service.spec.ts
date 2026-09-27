import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalitesService } from './localites.service';

// Règles du référentiel verrouillées ici : unicité du code sur les trois
// zones (message nommant la localité qui le détient), et code figé dès qu'un
// dossier l'utilise — le nom, lui, reste corrigeable.

const ALM = {
  id: 'L1',
  code: 'ALM',
  nom: 'Almadies',
  zone: 'dakar',
  region: 'Dakar',
  arrondissement: 'Almadies',
  commune: null,
  ordre: 0,
  createdAt: new Date(),
};

function svc(opts: { existante?: object | null; dossiers?: number } = {}) {
  const avecUsage = { ...ALM, _count: { dossiers: opts.dossiers ?? 0 } };
  const prisma = {
    localite: {
      findUnique: jest.fn(({ where }: { where: { id?: string; code?: string } }) =>
        Promise.resolve(where.id ? (where.id === 'L1' ? avecUsage : null) : opts.existante ?? null),
      ),
      aggregate: jest.fn().mockResolvedValue({ _max: { ordre: 4 } }),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'L2', ...data, _count: { dossiers: 0 } })),
      update: jest.fn(({ data }) =>
        Promise.resolve({
          ...avecUsage,
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        }),
      ),
    },
  };
  return { service: new LocalitesService(prisma as unknown as PrismaService), prisma };
}

describe('LocalitesService.creer', () => {
  it('code libre → créé en fin de zone, champs vides normalisés à null', async () => {
    const { service, prisma } = svc();
    const l = await service.creer({
      code: 'PTE',
      nom: ' Point E ',
      zone: 'dakar',
      region: 'Dakar',
      arrondissement: '  ',
      commune: 'Fann-Point E-Amitié',
    });
    expect(prisma.localite.create.mock.calls[0][0].data).toMatchObject({
      nom: 'Point E',
      arrondissement: null,
      commune: 'Fann-Point E-Amitié',
      ordre: 5,
    });
    expect(l.codeVerrouille).toBe(false);
  });

  it('code déjà pris (même par un pays) → 409 qui nomme la localité et sa zone', async () => {
    const { service, prisma } = svc({ existante: { nom: 'Somalie', zone: 'pays' } });
    await expect(
      service.creer({ code: 'SOM', nom: 'Somone', zone: 'senegal', region: 'Thiès' }),
    ).rejects.toThrow('Le code SOM est déjà pris par « Somalie » (Pays).');
    expect(prisma.localite.create).not.toHaveBeenCalled();
  });
});

describe('LocalitesService.modifier', () => {
  it('localité inconnue → 404', async () => {
    const { service } = svc();
    await expect(service.modifier('X', { nom: 'Y' })).rejects.toThrow(NotFoundException);
  });

  it('code utilisé par un dossier → changement de code refusé (409)', async () => {
    const { service, prisma } = svc({ dossiers: 2 });
    await expect(service.modifier('L1', { code: 'ALD' })).rejects.toThrow(ConflictException);
    expect(prisma.localite.update).not.toHaveBeenCalled();
  });

  it('code utilisé par un dossier → le nom reste corrigeable', async () => {
    const { service } = svc({ dossiers: 2 });
    const l = await service.modifier('L1', { nom: 'Les Almadies' });
    expect(l.nom).toBe('Les Almadies');
    expect(l.codeVerrouille).toBe(true);
  });

  it('même code renvoyé tel quel → pas traité comme un changement', async () => {
    const { service, prisma } = svc({ dossiers: 2 });
    await service.modifier('L1', { code: 'ALM', nom: 'Almadies' });
    expect(prisma.localite.update.mock.calls[0][0].data.code).toBeUndefined();
  });

  it('code inutilisé → modifiable s’il est libre', async () => {
    const { service } = svc();
    const l = await service.modifier('L1', { code: 'ALD' });
    expect(l.code).toBe('ALD');
  });
});
