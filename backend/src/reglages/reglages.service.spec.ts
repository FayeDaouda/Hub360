import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GABARIT_GC_CONCEPTION } from './gabarit-gc-conception';
import { ReglagesService } from './reglages.service';

const V0 = {
  id: 'V0',
  societeId: 'S',
  code: 'GC-CONCEPTION',
  numero: 0,
  libelle: 'bêta 1.0',
  contenu: GABARIT_GC_CONCEPTION,
  createdAt: new Date(),
};

function svc(o: { slug?: string; valeurs?: { cle: string; valeur: unknown }[]; version?: object | null } = {}) {
  const prisma = {
    societe: { findUnique: jest.fn().mockResolvedValue({ slug: o.slug ?? 'grey-concrete' }) },
    gabaritVersion: {
      findFirst: jest.fn().mockResolvedValue(o.version === undefined ? V0 : o.version),
      create: jest.fn().mockImplementation(({ data }) => ({ ...data, createdAt: new Date() })),
    },
    reglageSociete: { findMany: jest.fn().mockResolvedValue(o.valeurs ?? []), upsert: jest.fn() },
    journalReglage: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  return { s: new ReglagesService(prisma), prisma };
}

describe('ReglagesService', () => {
  it('société sans réglages définis : indisponible, rien d’extrapolé', async () => {
    await expect(svc({ slug: 'coded' }).s.lire('S')).resolves.toEqual({ disponible: false });
  });
  it('lecture : valeurs par défaut en service, bêta 1.0 créée à la première lecture', async () => {
    const { s, prisma } = svc({ version: null });
    const r = await s.lire('S');
    expect(prisma.gabaritVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numero: 0, libelle: 'bêta 1.0' }),
    });
    if (!r.disponible) throw new Error();
    expect(r.regles.find((x) => x.cle === 'parts_factures')?.enService).toEqual({ F1: 40, F2: 40, F3: 20 });
    // Objectifs validés le 14/10/2026 : plus aucun « à fixer ».
    expect(r.objectifs.filter((x) => x.enService === null)).toHaveLength(0);
    expect(r.objectifs.find((x) => x.cle === 'objectif_charge_equipes')?.enService).toEqual({ de: 70, a: 100 });
  });
  it('gabarit : nouvelle version + journal ; conflit de version ; aucune modification', async () => {
    const { s, prisma } = svc();
    const ch = [{ carte: 'livrables', tache: 'esquisses', champ: 'heures' as const, valeur: 32 }];
    await s.majGabarit('S', 'U', 'GC-CONCEPTION', { depuis: 0, motif: 'Décision du CODIR', changements: ch });
    expect(prisma.gabaritVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numero: 1, libelle: 'bêta 1.1', motif: 'Décision du CODIR' }),
    });
    expect(prisma.journalReglage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          section: 'gabarit',
          libelle: 'GC-CONCEPTION bêta 1.1 · Livrables · Esquisses — temps : 40 h → 32 h',
        }),
      ],
    });
    await expect(
      svc().s.majGabarit('S', 'U', 'GC-CONCEPTION', { depuis: 3, motif: 'x', changements: ch }),
    ).rejects.toThrow(ConflictException);
    await expect(
      svc().s.majGabarit('S', 'U', 'GC-CONCEPTION', {
        depuis: 0,
        motif: 'x',
        changements: [{ carte: 'livrables', champ: 'fin', valeur: 15 }],
      }),
    ).rejects.toThrow('Aucune modification');
  });
  it('règles : validation, seules les valeurs changées sont écrites et journalisées', async () => {
    const { s, prisma } = svc();
    await expect(
      s.majValeurs('S', 'U', 'regles', { motif: 'CODIR', valeurs: { parts_factures: { F1: 50, F2: 50, F3: 10 } } }),
    ).rejects.toThrow(BadRequestException);
    await expect(s.majValeurs('S', 'U', 'regles', { motif: 'CODIR', valeurs: { inconnue: 1 } })).rejects.toThrow(
      'Réglage inconnu',
    );
    await s.majValeurs('S', 'U', 'regles', {
      motif: 'CODIR',
      valeurs: { alerte_avenant_jours: 7, jours_feries: ['2026-12-25'] },
    });
    expect(prisma.journalReglage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ cle: 'jours_feries', libelle: 'Jours fériés : aucun → 25/12/2026', motif: 'CODIR' }),
      ],
    });
  });
});
