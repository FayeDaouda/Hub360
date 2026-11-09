import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GABARIT_GC_CONCEPTION } from './gabarit-gc-conception';
import { ReglagesService } from './reglages.service';
import { NotificationsBus } from '../realtime/notifications.bus';

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
  return { s: new ReglagesService(prisma, new NotificationsBus()), prisma };
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

// Temps réel (09/11/2026) : seuil de gouvernance modifié → notification au
// CEO, puis signal à ses écrans (sa cloche se relit). Ni signal pour l'auteur
// lui-même, ni pour un réglage hors gouvernance, ni si l'écriture échoue.
describe('ReglagesService · signal temps réel au CEO', () => {
  function monter(o: { ceo?: string[]; echec?: boolean } = {}) {
    const bus = new NotificationsBus();
    const signaux: { societeId: string; destinataireIds: string[] }[] = [];
    bus.all().subscribe((x) => signaux.push(x));
    const createMany = o.echec
      ? jest.fn().mockRejectedValue(new Error('base indisponible'))
      : jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      societe: { findUnique: jest.fn().mockResolvedValue({ slug: 'grey-concrete' }) },
      gabaritVersion: { findFirst: jest.fn().mockResolvedValue(V0), create: jest.fn() },
      reglageSociete: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      journalReglage: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn() },
      utilisateurSocieteRole: {
        findMany: jest.fn().mockResolvedValue((o.ceo ?? ['CEO1']).map((utilisateurId) => ({ utilisateurId }))),
      },
      notification: { createMany },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    return { s: new ReglagesService(prisma, bus), createMany, signaux };
  }
  const seuil = { motif: 'CODIR', valeurs: { seuil_contresignature_ceo: 60_000_000 } };

  it('seuil modifié par un autre que le CEO : notification puis signal au CEO', async () => {
    const { s, createMany, signaux } = monter({ ceo: ['CEO1', 'CEO1'] });
    await s.majValeurs('S', 'CFO1', 'regles', seuil);
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ destinataireId: 'CEO1', type: 'reglage_gouvernance_modifie' })],
    });
    expect(signaux).toEqual([{ societeId: 'S', destinataireIds: ['CEO1'], kind: 'new' }]);
  });

  it('le CEO modifie lui-même le seuil : ni notification ni signal', async () => {
    const { s, createMany, signaux } = monter();
    await s.majValeurs('S', 'CEO1', 'regles', seuil);
    expect(createMany).not.toHaveBeenCalled();
    expect(signaux).toEqual([]);
  });

  it('réglage hors gouvernance : aucun signal', async () => {
    const { s, signaux } = monter();
    await s.majValeurs('S', 'CFO1', 'regles', { motif: 'CODIR', valeurs: { alerte_avenant_jours: 10 } });
    expect(signaux).toEqual([]);
  });

  it('écriture de la notification en échec : aucun signal', async () => {
    const { s, signaux } = monter({ echec: true });
    await expect(s.majValeurs('S', 'CFO1', 'regles', seuil)).rejects.toThrow('base indisponible');
    expect(signaux).toEqual([]);
  });
});
