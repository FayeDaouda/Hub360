import { OnboardingService } from './onboarding.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';

// Deux points de décision privés, appelés par leur nom : le code (toujours
// généré, suffixe -2/-3 en cas de collision, 400 si une information manque)
// et le client (existant inchangé, ou créé tel que saisi — plus de sigle).

type Prive = {
  resoudreCode: (tx: unknown, societeId: string, client: unknown, codeLocalite: string) => Promise<string>;
  resoudreClient: (tx: unknown, societeId: string, ref: unknown) => Promise<unknown>;
};

function prismaMock(opts: { codes?: string[]; client?: object | null } = {}) {
  return {
    dossierCrm: {
      findMany: jest.fn().mockResolvedValue((opts.codes ?? []).map((code) => ({ code }))),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(opts.client ?? null),
      aggregate: jest.fn().mockResolvedValue({ _max: { numero: 8 } }),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'C-neuf', ...data })),
      update: jest.fn(({ data }) => Promise.resolve({ ...opts.client, ...data })),
    },
  };
}

function svc(prisma: ReturnType<typeof prismaMock>) {
  return new CrmService(
    prisma as unknown as PrismaService,
    {} as DevisService,
    {} as FacturationService,
    {} as NotificationsService,
    {} as SeuilCeoService,
    {} as OnboardingService,
  ) as unknown as Prive;
}

const annee = String(new Date().getFullYear()).slice(-2);
const DAOUDA = { nom: 'Daouda Faye Sow', type: 'particulier', sigle: null };

describe('CrmService.resoudreCode', () => {
  it('généré selon la nomenclature', async () => {
    const prisma = prismaMock();
    await expect(svc(prisma).resoudreCode(prisma, 'S1', DAOUDA, 'ALM')).resolves.toBe(`DFS_ALM.${annee}`);
  });

  it('base déjà prise → suffixe -2 ; -2 pris aussi → -3', async () => {
    const prisma = prismaMock({ codes: [`DFS_ALM.${annee}`, `DFS_ALM.${annee}-2`] });
    await expect(svc(prisma).resoudreCode(prisma, 'S1', DAOUDA, 'ALM')).resolves.toBe(`DFS_ALM.${annee}-3`);
  });

  it('personne morale sans sigle → initiales de la raison sociale', async () => {
    const prisma = prismaMock();
    await expect(
      svc(prisma).resoudreCode(prisma, 'S1', { nom: 'SCI Les Filaos', type: 'sci', sigle: null }, 'ALM'),
    ).resolves.toBe(`FIL_ALM.${annee}`);
  });

  it('nom vide → 400, aucun code de repli', async () => {
    const prisma = prismaMock();
    await expect(
      svc(prisma).resoudreCode(prisma, 'S1', { nom: ' ', type: 'entreprise', sigle: null }, 'ALM'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CrmService.resoudreClient', () => {
  it('nouvelle personne morale → créée telle que saisie, sans sigle, référence suivante (CL-0009)', async () => {
    const prisma = prismaMock();
    await svc(prisma).resoudreClient(prisma, 'S1', {
      nouveau: { nom: 'SCI Les Filaos', type: 'entreprise' },
    });
    expect(prisma.client.create).toHaveBeenCalledWith({
      data: { societeId: 'S1', numero: 9, nom: 'SCI Les Filaos', type: 'entreprise' },
    });
  });

  it('client existant → sa fiche ne change pas', async () => {
    const prisma = prismaMock({
      client: { id: 'C1', nom: 'Teranga Capital', type: 'entreprise', sigle: null },
    });
    await expect(svc(prisma).resoudreClient(prisma, 'S1', { id: 'C1' })).resolves.toMatchObject({
      id: 'C1',
    });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('client d’une autre société → 404', async () => {
    const prisma = prismaMock({ client: null });
    await expect(svc(prisma).resoudreClient(prisma, 'S1', { id: 'AUTRE' })).rejects.toThrow('Client introuvable');
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
    const s = new CrmService(
      prisma as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    ) as unknown as P;
    return (choisi?: string) => s.resoudreProprietaire(prisma, 'S1', choisi);
  };

  it('aucun titulaire → null (« à assigner »), pas d’erreur', async () => {
    await expect(avecTitulaires([])()).resolves.toBeNull();
  });

  it('un seul titulaire → choisi d’office', async () => {
    await expect(avecTitulaires(['U1'])()).resolves.toBe('U1');
  });

  it('plusieurs titulaires sans choix → null (« à assigner »), pas de choix arbitraire', async () => {
    await expect(avecTitulaires(['U1', 'U2'])()).resolves.toBeNull();
  });

  it('choix explicite parmi les titulaires → retenu', async () => {
    await expect(avecTitulaires(['U1', 'U2'])('U2')).resolves.toBe('U2');
  });

  it('choix hors titulaires → 400', async () => {
    await expect(avecTitulaires(['U1'])('INTRUS')).rejects.toThrow(BadRequestException);
  });
});

// Fiche apporteur (maquette « Nouveau projet ») : obligatoire, validée et
// verrouillée à la création — % attribué compris, saisi par le créateur —
// puis modifiable par le COO seul.
describe('CrmService — fiche apporteur', () => {
  const DTO = {
    nature: 'mandat_client',
    localiteId: 'L1',
    client: { id: 'C1' },
    apporteur: { type: 'aucun' },
  };
  const CLIENT = { id: 'C1', nom: 'Awa Sow', type: 'particulier', sigle: null };
  // Données écrites, telles que le service les passe à Prisma.
  type Ecrit = Record<string, unknown> & { transitions: { create: Record<string, unknown> } };
  // Relecture du dossier après écriture : la forme minimale que versDossierCrm lit.
  const relu = ({ data }: { data: Ecrit }) =>
    Promise.resolve({
      id: 'D1',
      code: 'AS_ALM.26',
      statut: 'nouveau_projet',
      programme: '',
      commissionApporteur: null,
      ...data,
      client: CLIENT,
      localite: null,
      creePar: null,
      apporteurUtilisateur: null,
      proprietaire: null,
      archivePar: null,
      offres: [],
    });

  function svcCreation() {
    const tx = {
      client: { findFirst: jest.fn().mockResolvedValue(CLIENT) },
      localite: { findUnique: jest.fn().mockResolvedValue({ id: 'L1', code: 'ALM', nom: 'Almadies' }) },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
      dossierCrm: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(relu) },
    };
    const prisma = { $transaction: jest.fn((f: (t: typeof tx) => unknown) => f(tx)) };
    const s = new CrmService(
      prisma as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    );
    return { s, tx };
  }
  const cio = { userId: 'U-CIO', role: 'CIO (transverse)', permissions: { crm: 'ecriture' as const } };

  it('affaire directe → colonnes à null, tracée sur la ligne de création', async () => {
    const { s, tx } = svcCreation();
    await s.creer('S1', cio, DTO as never);
    const data = tx.dossierCrm.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      apporteurType: null,
      apporteurUtilisateurId: null,
      apporteurNom: null,
      apporteurStructure: null,
      commissionApporteur: null,
    });
    expect(data.transitions.create.commentaire).toBe('Fiche apporteur : affaire directe, validée et verrouillée');
  });

  it('apporteur externe → fiche complète, % saisi sans droit Finances', async () => {
    const { s, tx } = svcCreation();
    const projet = await s.creer('S1', cio, {
      ...DTO,
      apporteur: {
        type: 'externe',
        nom: ' Aïssatou Ba ',
        structure: 'Notaire',
        telephone: '+221 77 000 00 00',
        commission: 4,
      },
    } as never);
    const data = tx.dossierCrm.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      apporteurType: 'externe',
      apporteurNom: 'Aïssatou Ba',
      apporteurStructure: 'Notaire',
      apporteurTelephone: '+221 77 000 00 00',
      apporteurEmail: null,
      commissionApporteur: 4,
    });
    expect(data.transitions.create.commentaire).toBe('Fiche apporteur : Aïssatou Ba (Notaire), validée et verrouillée');
    // Partie de la fiche apporteur : toujours dans la réponse.
    expect(projet.commissionApporteur).toBe(4);
  });

  function svcModif(dossier: object | null) {
    const prisma = {
      dossierCrm: { findFirst: jest.fn().mockResolvedValue(dossier), update: jest.fn(relu) },
    };
    const s = new CrmService(
      prisma as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    );
    return { s, prisma };
  }
  const coo = { userId: 'U-COO', role: 'COO', permissions: { crm: 'ecriture' as const } };
  const NOUVELLE = { type: 'externe', nom: 'Aïssatou Ba', commission: 3.5 } as never;

  it.each(['societe_admin', 'CIO (transverse)', 'Dir. GC'])(
    'modification par %s → 403, rien écrit (le COO seul)',
    async (role) => {
      const { s, prisma } = svcModif({ statut: 'nouveau_projet', archiveLe: null });
      await expect(s.modifierApporteur('S1', { userId: 'X', role, permissions: {} }, 'D1', NOUVELLE)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.dossierCrm.update).not.toHaveBeenCalled();
    },
  );

  it('modification par le COO → fiche remplacée, événement tracé sans changer d’étape', async () => {
    const { s, prisma } = svcModif({ statut: 'offre_envoyee', archiveLe: null });
    await s.modifierApporteur('S1', coo, 'D1', NOUVELLE);
    const data = prisma.dossierCrm.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ apporteurType: 'externe', apporteurNom: 'Aïssatou Ba', commissionApporteur: 3.5 });
    expect(data.transitions.create).toEqual({
      de: 'offre_envoyee',
      vers: 'offre_envoyee',
      parId: 'U-COO',
      commentaire: 'Fiche apporteur modifiée : Aïssatou Ba',
    });
  });

  it('lead archivé → 409, même pour le COO', async () => {
    const { s } = svcModif({ statut: 'nouveau_projet', archiveLe: new Date() });
    await expect(s.modifierApporteur('S1', coo, 'D1', NOUVELLE)).rejects.toThrow(ConflictException);
  });
});

// Réassignation (étape C2) : titulaires Dir. GC, societe_admin, CIO — pas
// tout rôle qui a l'écriture sur le CRM.
describe('CrmService.peutReassigner', () => {
  const svcTitulaires = (ids: string[]) =>
    new CrmService(
      {
        utilisateur: {
          findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id, prenom: 'P', nom: id }))),
        },
      } as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    );
  const acteur = (userId: string, role: string) => ({ userId, role, permissions: {} });

  it.each(['societe_admin', 'CIO (transverse)'])('%s → oui, en supervision', async (role) => {
    await expect(svcTitulaires([]).peutReassigner('S1', acteur('X', role))).resolves.toBe(true);
  });

  it('titulaire Dir. GC → oui (transfert entre collègues)', async () => {
    await expect(svcTitulaires(['U1', 'U2']).peutReassigner('S1', acteur('U1', 'Dir. GC'))).resolves.toBe(true);
  });

  it('COO (écriture CRM, mais pas titulaire) → non', async () => {
    await expect(svcTitulaires(['U1']).peutReassigner('S1', acteur('U9', 'COO'))).resolves.toBe(false);
  });

  it('Administrateur HUB → oui, quel que soit le rôle endossé (même Dir. GC sans en être titulaire)', async () => {
    await expect(
      svcTitulaires(['U1']).peutReassigner('S1', { ...acteur('ADM', 'Dir. GC'), adminHub: true }),
    ).resolves.toBe(true);
  });
});

// Désarchivage (décision du 29/10/2026) : mêmes titulaires que l'archivage ;
// le lead revient, l'archivage effacé reste dans l'historique.
describe('CrmService.desarchiver', () => {
  const svcDesarchive = (dossier: object | null, titulaires: string[] = []) => {
    const tx = {
      dossierCrm: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dossierCrmTransition: { create: jest.fn() },
    };
    const prisma = {
      dossierCrm: { findFirst: jest.fn().mockResolvedValue(dossier), findUniqueOrThrow: jest.fn() },
      utilisateur: {
        findMany: jest.fn().mockResolvedValue(titulaires.map((id) => ({ id, prenom: 'P', nom: id }))),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const s = new CrmService(
      prisma as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    );
    return { s, tx };
  };
  const cio = { userId: 'C1', role: 'CIO (transverse)', permissions: {} };
  const archive = { archiveLe: new Date('2026-10-20T10:00:00Z'), archivePar: { prenom: 'Awa', nom: 'Sarr' } };

  it('archivé → rendu au pipeline, trace dans l’historique', async () => {
    const { s, tx } = svcDesarchive(archive);
    await s.desarchiver('S1', cio, 'D1').catch(() => undefined); // relecture non simulée
    expect(tx.dossierCrm.updateMany).toHaveBeenCalledWith({
      where: { id: 'D1', archiveLe: { not: null } },
      data: { archiveLe: null, archiveParId: null },
    });
    expect(tx.dossierCrmTransition.create.mock.calls[0][0].data).toMatchObject({
      de: 'nouveau_projet',
      vers: 'nouveau_projet',
      parId: 'C1',
      commentaire: 'Lead désarchivé (archivé le 20/10/2026 par Awa Sarr)',
    });
  });

  it('COO → 403 ; lead non archivé → 409', async () => {
    const coo = svcDesarchive(archive, ['U1']);
    await expect(coo.s.desarchiver('S1', { userId: 'U9', role: 'COO', permissions: {} }, 'D1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(coo.tx.dossierCrm.updateMany).not.toHaveBeenCalled();
    await expect(svcDesarchive({ archiveLe: null }).s.desarchiver('S1', cio, 'D1')).rejects.toThrow(ConflictException);
  });
});

// Archivage d'un lead (maquette CRM) : Direction GC ou CIO, « Nouveau
// projet » seulement — la ligne reste (code réservé), désarchivable.
describe('CrmService.archiver', () => {
  const svcArchive = (dossier: object | null, titulaires: string[] = []) => {
    const prisma = {
      dossierCrm: {
        findFirst: jest.fn().mockResolvedValue(dossier),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      utilisateur: {
        findMany: jest.fn().mockResolvedValue(titulaires.map((id) => ({ id, prenom: 'P', nom: id }))),
      },
    };
    const s = new CrmService(
      prisma as unknown as PrismaService,
      {} as DevisService,
      {} as FacturationService,
      {} as NotificationsService,
      {} as SeuilCeoService,
      {} as OnboardingService,
    );
    return { s, prisma };
  };
  const cio = { userId: 'C1', role: 'CIO (transverse)', permissions: {} };
  const lead = { statut: 'nouveau_projet', archiveLe: null };

  it('COO (écriture CRM, pas Direction GC) → 403, rien écrit', async () => {
    const { s, prisma } = svcArchive(lead, ['U1']);
    await expect(s.archiver('S1', { userId: 'U9', role: 'COO', permissions: {} }, 'D1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.dossierCrm.updateMany).not.toHaveBeenCalled();
  });

  it.each(['en_validation', 'offre_envoyee', 'onboard', 'perdu'])('statut %s → 409', async (statut) => {
    const { s, prisma } = svcArchive({ statut, archiveLe: null });
    await expect(s.archiver('S1', cio, 'D1')).rejects.toThrow(ConflictException);
    expect(prisma.dossierCrm.updateMany).not.toHaveBeenCalled();
  });

  it('déjà archivé → 409', async () => {
    const { s } = svcArchive({ statut: 'nouveau_projet', archiveLe: new Date() });
    await expect(s.archiver('S1', cio, 'D1')).rejects.toThrow(ConflictException);
  });

  it('lead en « Nouveau projet » → horodaté et attribué, jamais supprimé', async () => {
    const { s, prisma } = svcArchive(lead);
    await s.archiver('S1', cio, 'D1').catch(() => undefined); // relecture non simulée
    const arg = prisma.dossierCrm.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'D1', statut: 'nouveau_projet', archiveLe: null });
    expect(arg.data.archiveParId).toBe('C1');
    expect(arg.data.archiveLe).toBeInstanceOf(Date);
  });

  it('lead archivé : plus aucune action du cycle', async () => {
    const { s } = svcArchive({ ...lead, archiveLe: new Date(), projet: null });
    await expect(s.agir('S1', cio, 'D1', 'soumettre', undefined)).rejects.toThrow(ConflictException);
  });
});
