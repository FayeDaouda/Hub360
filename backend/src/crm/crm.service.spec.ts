import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';

// Deux points de décision privés, appelés par leur nom : le code (toujours
// généré, suffixe -2/-3 en cas de collision, 400 si une information manque)
// et le client (sigle obligatoire pour une personne morale, complété sur la
// fiche existante si elle n'en a pas).

type Prive = {
  resoudreCode: (
    tx: unknown,
    societeId: string,
    client: unknown,
    codeLocalite: string,
  ) => Promise<string>;
  resoudreClient: (tx: unknown, societeId: string, ref: unknown) => Promise<unknown>;
};

function prismaMock(opts: { codes?: string[]; client?: object | null } = {}) {
  return {
    dossierCrm: {
      findMany: jest.fn().mockResolvedValue((opts.codes ?? []).map((code) => ({ code }))),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(opts.client ?? null),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'C-neuf', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ ...opts.client, ...data })),
    },
  };
}

function svc(prisma: ReturnType<typeof prismaMock>) {
  return new CrmService(prisma as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService) as unknown as Prive;
}

const annee = String(new Date().getFullYear()).slice(-2);
const DAOUDA = { nom: 'Daouda Faye Sow', type: 'particulier', sigle: null };

describe('CrmService.resoudreCode', () => {
  it('généré selon la nomenclature', async () => {
    const prisma = prismaMock();
    await expect(svc(prisma).resoudreCode(prisma, 'S1', DAOUDA, 'ALM')).resolves.toBe(
      `DFS_ALM.${annee}`,
    );
  });

  it('base déjà prise → suffixe -2 ; -2 pris aussi → -3', async () => {
    const prisma = prismaMock({ codes: [`DFS_ALM.${annee}`, `DFS_ALM.${annee}-2`] });
    await expect(svc(prisma).resoudreCode(prisma, 'S1', DAOUDA, 'ALM')).resolves.toBe(
      `DFS_ALM.${annee}-3`,
    );
  });

  it('personne morale sans sigle → 400, aucun code de repli', async () => {
    const prisma = prismaMock();
    await expect(
      svc(prisma).resoudreCode(
        prisma,
        'S1',
        { nom: 'Teranga Capital', type: 'entreprise', sigle: null },
        'ALM',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CrmService.resoudreClient', () => {
  it('nouveau particulier → sigle ignoré (null)', async () => {
    const prisma = prismaMock();
    await svc(prisma).resoudreClient(prisma, 'S1', {
      nouveau: { nom: 'Awa Sow', type: 'particulier', sigle: 'XYZ' },
    });
    expect(prisma.client.create.mock.calls[0][0].data.sigle).toBeNull();
  });

  it('nouvelle personne morale → sigle normalisé et enregistré', async () => {
    const prisma = prismaMock();
    await svc(prisma).resoudreClient(prisma, 'S1', {
      nouveau: { nom: 'SCI Ndiaye Frères', type: 'sci', sigle: ' s.n.f ' },
    });
    expect(prisma.client.create.mock.calls[0][0].data.sigle).toBe('SNF');
  });

  it('nouvelle personne morale sans sigle → 400, rien créé', async () => {
    const prisma = prismaMock();
    await expect(
      svc(prisma).resoudreClient(prisma, 'S1', {
        nouveau: { nom: 'Teranga Capital', type: 'entreprise' },
      }),
    ).rejects.toThrow('Le sigle est obligatoire');
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('personne morale existante sans sigle → complétée sur sa fiche', async () => {
    const prisma = prismaMock({
      client: { id: 'C1', nom: 'Teranga Capital', type: 'entreprise', sigle: null },
    });
    const c = await svc(prisma).resoudreClient(prisma, 'S1', { id: 'C1', sigle: 'tc' });
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'C1' },
      data: { sigle: 'TC' },
    });
    expect(c).toMatchObject({ sigle: 'TC' });
  });

  it('personne morale existante avec sigle → inchangée, sigle fourni ignoré', async () => {
    const prisma = prismaMock({
      client: { id: 'C1', nom: 'Teranga Capital', type: 'entreprise', sigle: 'TC' },
    });
    await svc(prisma).resoudreClient(prisma, 'S1', { id: 'C1', sigle: 'AUTRE' });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});

// Propriétaire (étape C1) : titulaires du rôle Dir. GC de la société.
describe('CrmService.resoudreProprietaire', () => {
  type P = {
    resoudreProprietaire: (tx: unknown, societeId: string, choisi?: string) => Promise<string | null>;
  };
  const avecTitulaires = (ids: string[]) => {
    const prisma = {
      utilisateur: {
        findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id, prenom: 'P', nom: id }))),
      },
    };
    const s = new CrmService(prisma as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService) as unknown as P;
    return (choisi?: string) => s.resoudreProprietaire(prisma, 'S1', choisi);
  };

  it('aucun titulaire → null (« à assigner »), pas d’erreur', async () => {
    await expect(avecTitulaires([])()).resolves.toBeNull();
  });

  it('un seul titulaire → choisi d’office', async () => {
    await expect(avecTitulaires(['U1'])()).resolves.toBe('U1');
  });

  it('plusieurs titulaires sans choix → 400, pas de choix arbitraire', async () => {
    await expect(avecTitulaires(['U1', 'U2'])()).rejects.toThrow('choisis le propriétaire');
  });

  it('choix explicite parmi les titulaires → retenu', async () => {
    await expect(avecTitulaires(['U1', 'U2'])('U2')).resolves.toBe('U2');
  });

  it('choix hors titulaires → 400', async () => {
    await expect(avecTitulaires(['U1'])('INTRUS')).rejects.toThrow(BadRequestException);
  });
});

// Commission d'apporteur : donnée finances_charges.
describe('CrmService — commission d’apporteur', () => {
  const DTO = {
    nature: 'mandat_client',
    categorie: 'conception',
    localiteId: 'L1',
    type: 'villa',
    nbPlanches: 2,
    surfaceTerrain: 0,
    standing: 'moyen',
    gamme: 'milieu',
    programme: 'X',
    statut: 'nouveau',
    client: { id: 'C1' },
    apporteur: { type: 'externe', nom: 'Me Ndiaye' },
    commissionApporteur: 4,
  };

  it('saisie sans finances_charges en écriture → 403 avant toute écriture', async () => {
    const prisma = { $transaction: jest.fn() };
    const s = new CrmService(prisma as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService);
    await expect(
      s.creer('S1', { userId: 'U', role: 'COO', permissions: { finances_charges: 'lecture' } }, DTO as never),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('dossier de conception sans planches → 400 (base du tarif CO)', async () => {
    const prisma = { $transaction: jest.fn() };
    const s = new CrmService(prisma as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService);
    await expect(
      s.creer(
        'S1',
        { userId: 'U', role: 'COO', permissions: {} },
        { ...DTO, nbPlanches: 0, commissionApporteur: null } as never,
      ),
    ).rejects.toThrow('Nombre de planches requis');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lecture : clé absente sans le droit, présente avec', () => {
    const s = new CrmService({} as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService) as unknown as {
      optsFormat: (a: unknown) => { voitCommission: boolean };
    };
    expect(s.optsFormat({ permissions: {} }).voitCommission).toBe(false);
    expect(s.optsFormat({ permissions: { finances_charges: 'lecture' } }).voitCommission).toBe(true);
  });
});

// Réassignation (étape C2) : titulaires Dir. GC, societe_admin, CIO — pas
// tout rôle qui a l'écriture sur le CRM.
describe('CrmService.peutReassigner', () => {
  const svcTitulaires = (ids: string[]) =>
    new CrmService({
      utilisateur: {
        findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id, prenom: 'P', nom: id }))),
      },
    } as unknown as PrismaService, {} as DevisService, {} as FacturationService, {} as NotificationsService);
  const acteur = (userId: string, role: string) => ({ userId, role, permissions: {} });

  it.each(['societe_admin', 'CIO (transverse)'])('%s → oui, en supervision', async (role) => {
    await expect(svcTitulaires([]).peutReassigner('S1', acteur('X', role))).resolves.toBe(true);
  });

  it('titulaire Dir. GC → oui (transfert entre collègues)', async () => {
    await expect(
      svcTitulaires(['U1', 'U2']).peutReassigner('S1', acteur('U1', 'Dir. GC')),
    ).resolves.toBe(true);
  });

  it('COO (écriture CRM, mais pas titulaire) → non', async () => {
    await expect(svcTitulaires(['U1']).peutReassigner('S1', acteur('U9', 'COO'))).resolves.toBe(
      false,
    );
  });
});
