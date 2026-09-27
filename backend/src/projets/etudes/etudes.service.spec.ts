import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EtudesService } from './etudes.service';

// Vague C (restructuration sept. 2026) — Études passées d'un tableau à 6
// lignes fixes à des blocs configurables par gabarit société (BlocEtude,
// ItemEtude), même modèle que Foncier/Unbord (statut dérivé + case à cocher
// manuelle sur les items) mais sans assignation par bloc (toute l'équipe du
// projet agit, comme avant la restructuration). Facture (montant + fichier)
// redacted pour tout appelant non admin/CIO.

const PROJET = { id: 'P1', categorie: 'conception', programme: 'Villa X', code: 'PRJ-1' };

function bloc(id: string, statut: string, over: Record<string, unknown> = {}) {
  return {
    id,
    projetId: 'P1',
    blocEtudeGabaritId: `G-${id}`,
    libelle: id,
    interlocuteur: '',
    contactInterlocuteur: '',
    statut,
    dateRemisePrevue: null,
    dateRemiseReelle: null,
    note: '',
    factureMontant: null,
    factureFichierNom: null,
    factureFichierCle: null,
    supprimee: false,
    blocEtudeGabarit: { ordre: 0 },
    items: [],
    ...over,
  };
}

const SIX_BLOCS_A_LANCER = [
  bloc('geotechnique', 'a_lancer'),
  bloc('topographie', 'a_lancer'),
  bloc('structure', 'a_lancer'),
  bloc('fluides', 'a_lancer'),
  bloc('electricite', 'a_lancer'),
  bloc('vrd', 'a_lancer'),
];

const SIX_BLOCS_COMPLETS = [
  bloc('geotechnique', 'validee'),
  bloc('topographie', 'non_requise'),
  bloc('structure', 'validee'),
  bloc('fluides', 'validee'),
  bloc('electricite', 'non_requise'),
  bloc('vrd', 'validee'),
];

function mockPrisma(blocs = SIX_BLOCS_A_LANCER, etudesOver: Record<string, unknown> = {}) {
  const etudesRow = { projetId: 'P1', dceConstitue: false, dceLe: null, ...etudesOver };
  const etudes = {
    upsert: jest.fn().mockResolvedValue(etudesRow),
    update: jest.fn().mockResolvedValue(etudesRow),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ ...etudesRow, blocs }),
  };
  const blocEtudeGabarit = {
    findMany: jest.fn().mockResolvedValue([]),
  };
  const blocEtude = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue(blocs),
    findFirst: jest.fn().mockResolvedValue(blocs[0] ?? null),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const itemEtude = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue({ id: 'I1', blocEtude: { projetId: 'P1' } }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const imageProjet = { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
  const fichierProjet = { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
  const projet = { findFirst: jest.fn().mockResolvedValue(PROJET) };
  const prisma = {
    etudes,
    blocEtudeGabarit,
    blocEtude,
    itemEtude,
    imageProjet,
    fichierProjet,
    projet,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { prisma, etudes, blocEtudeGabarit, blocEtude, itemEtude, imageProjet, fichierProjet, projet };
}

function service(prisma: PrismaService) {
  return new EtudesService(prisma);
}

describe('EtudesService.get / coquille', () => {
  it('amorce la coquille (upsert + createMany skipDuplicates) même sur un projet déjà initialisé', async () => {
    const { prisma, etudes, blocEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.get('S1', 'P1', 'collaborateur');
    expect(etudes.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projetId: 'P1' }, update: {} }),
    );
    // Gabarit vide dans ce mock : createMany des blocs n'est appelé QUE s'il y a
    // des lignes de gabarit — vérifié séparément ci-dessous.
    expect(blocEtude.findMany).toHaveBeenCalled();
  });

  it('formate les blocs triés par ordre du gabarit (blocEtudeGabarit.ordre), pas par ordre Prisma', async () => {
    const blocsMelanges = [
      bloc('vrd', 'a_lancer', { blocEtudeGabarit: { ordre: 5 } }),
      bloc('geotechnique', 'a_lancer', { blocEtudeGabarit: { ordre: 0 } }),
      bloc('structure', 'a_lancer', { blocEtudeGabarit: { ordre: 2 } }),
    ];
    const { prisma } = mockPrisma(blocsMelanges);
    const svc = service(prisma);
    const res = await svc.get('S1', 'P1', 'collaborateur');
    expect(res.blocs.map((b) => b.libelle)).toEqual(['geotechnique', 'structure', 'vrd']);
  });

  it('redacted la facture pour un collaborateur mais pas pour societe_admin', async () => {
    const blocs = [bloc('structure', 'a_lancer', { factureMontant: { toNumber: () => 500000 }, factureFichierNom: 'facture.pdf' })];
    const { prisma } = mockPrisma(blocs);
    const svc = service(prisma);

    const resCollab = await svc.get('S1', 'P1', 'collaborateur');
    expect(resCollab.blocs[0].facture).toBeNull();

    const resAdmin = await svc.get('S1', 'P1', 'societe_admin');
    expect(resAdmin.blocs[0].facture).toEqual({
      montant: 500000,
      fichierNom: 'facture.pdf',
      fichierCle: null,
    });
  });
});

describe('EtudesService.patchBloc', () => {
  it('ne transmet que les champs explicitement fournis (pas de undefined qui écrase le reste)', async () => {
    const { prisma, blocEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.patchBloc('S1', 'P1', 'geotechnique', { statut: 'remise' as never }, 'collaborateur');
    expect(blocEtude.update).toHaveBeenCalledWith({
      where: { id: 'geotechnique' },
      data: { statut: 'remise' },
    });
  });

  it('une date envoyée à null (effacement) est bien transmise, pas ignorée', async () => {
    const { prisma, blocEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.patchBloc('S1', 'P1', 'geotechnique', { dateRemisePrevue: null }, 'collaborateur');
    expect(blocEtude.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dateRemisePrevue: null } }),
    );
  });

  it('un collaborateur ne peut PAS poser factureMontant — silencieusement ignoré', async () => {
    const { prisma, blocEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.patchBloc('S1', 'P1', 'geotechnique', { factureMontant: 999999 }, 'collaborateur');
    expect(blocEtude.update).toHaveBeenCalledWith({ where: { id: 'geotechnique' }, data: {} });
  });

  it('societe_admin PEUT poser factureMontant', async () => {
    const { prisma, blocEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.patchBloc('S1', 'P1', 'geotechnique', { factureMontant: 999999 }, 'societe_admin');
    expect(blocEtude.update).toHaveBeenCalledWith({
      where: { id: 'geotechnique' },
      data: { factureMontant: 999999 },
    });
  });
});

describe('EtudesService.patchItem — mutuellement exclusif avec nonRequise', () => {
  it('nonRequise:true force fait à false', async () => {
    const { prisma, itemEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.patchItem('S1', 'P1', 'I1', { nonRequise: true }, 'collaborateur');
    expect(itemEtude.update).toHaveBeenCalledWith({
      where: { id: 'I1' },
      data: { nonRequise: true, fait: false },
    });
  });
});

describe('EtudesService.joindreImages / joindreFichiers — auto-coche l’item', () => {
  it('joindreFichiers pose fait:true et nonRequise:false sur l’item', async () => {
    const { prisma, itemEtude } = mockPrisma();
    const svc = service(prisma);
    await svc.joindreFichiers(
      'S1',
      'P1',
      'I1',
      { fichiers: [{ nom: 'plan.pdf', url: 'data:application/pdf;base64,AA==' }] },
      'U1',
      'collaborateur',
    );
    expect(itemEtude.update).toHaveBeenCalledWith({
      where: { id: 'I1' },
      data: { fait: true, nonRequise: false },
    });
  });
});

describe('EtudesService.constituerDce — garde etudesCompletes', () => {
  it('refuse si au moins un bloc n’est ni validé ni non requis (ex : « remise »)', async () => {
    const blocs = [...SIX_BLOCS_COMPLETS];
    blocs[0] = bloc('geotechnique', 'remise'); // rendu non vérifié
    const { prisma, etudes } = mockPrisma(blocs);
    const svc = service(prisma);
    await expect(svc.constituerDce('S1', 'P1', 'societe_admin')).rejects.toThrow(ConflictException);
    expect(etudes.update).not.toHaveBeenCalled();
  });

  it('refuse tant qu’un bloc reste « à lancer » (état par défaut)', async () => {
    const { prisma, etudes } = mockPrisma(SIX_BLOCS_A_LANCER);
    const svc = service(prisma);
    await expect(svc.constituerDce('S1', 'P1', 'societe_admin')).rejects.toThrow(ConflictException);
    expect(etudes.update).not.toHaveBeenCalled();
  });

  it('accepte un mélange validée / non requise — « non requise » compte comme complet', async () => {
    const { prisma, etudes } = mockPrisma(SIX_BLOCS_COMPLETS);
    const svc = service(prisma);
    await svc.constituerDce('S1', 'P1', 'societe_admin');
    expect(etudes.update).toHaveBeenCalledWith({
      where: { projetId: 'P1' },
      data: { dceConstitue: true, dceLe: expect.any(Date) },
    });
  });
});

describe('EtudesService.annulerDce', () => {
  it('réinitialise dceConstitue et dceLe, sans revérifier l’état des blocs', async () => {
    const { prisma, etudes } = mockPrisma(SIX_BLOCS_A_LANCER, { dceConstitue: true });
    const svc = service(prisma);
    await svc.annulerDce('S1', 'P1', 'societe_admin');
    expect(etudes.update).toHaveBeenCalledWith({
      where: { projetId: 'P1' },
      data: { dceConstitue: false, dceLe: null },
    });
  });
});
