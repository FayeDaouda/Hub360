import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DevisService } from '../devis/devis.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeuilCeoService } from '../finances/seuil-ceo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';
import { OnboardingService } from './onboarding.service';
import { REGLES_ACTIONS } from './cycle';

// Cycle commercial (étape E) — CrmService.agir, contre un Prisma simulé.
// On verrouille : qui peut faire quoi, depuis quel statut, le texte
// obligatoire, la garde de concurrence et la transaction pivot (onboard, via
// le vrai OnboardingService).

const DOSSIER = {
  id: 'D1',
  societeId: 'S1',
  code: 'DF_ALM.26',
  nature: 'mandat_client',
  categorie: 'conception',
  programme: 'Villa',
  localisation: 'Almadies',
  localiteId: 'L1',
  latitude: null,
  longitude: null,
  type: 'villa',
  surfaceTerrain: 350,
  nbPlanches: 3,
  standing: 'moyen',
  gamme: 'milieu',
  clientId: 'C1',
  archiveLe: null,
  archivePar: null,
  commissionApporteur: null,
  apporteurType: 'interne',
  client: { id: 'C1', nom: 'X', type: 'particulier' },
  localite: null,
  creePar: null,
  apporteurUtilisateur: null,
  proprietaire: null,
  offres: [],
};

type Offre = { id: string; statut: string; dateValidite: string | null };

function monter(
  statut: string,
  opts: {
    basculees?: number;
    projet?: object | null;
    // Lignes du brouillon d'offre [quantité, prix] ; null = aucun brouillon.
    lignesBrouillon?: [number, number][] | null;
    offres?: Offre[]; // offres envoyées / acceptées du dossier
  } = {},
) {
  const prisma = {
    dossierCrm: {
      findFirst: jest.fn().mockResolvedValue({ ...DOSSIER, statut, projet: opts.projet ?? null }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.basculees ?? 1 }),
      findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve({ ...DOSSIER, statut: 'X' })),
    },
    dossierCrmTransition: { create: jest.fn().mockResolvedValue({}) },
    devis: {
      // Brouillon d'offre (soumettre) ou offre acceptée (Onboard).
      findFirst: jest.fn(({ where }: { where: { statut: string } }) =>
        Promise.resolve(
          where.statut === 'accepte'
            ? ((opts.offres ?? []).find((o) => o.statut === 'accepte') ?? null)
            : opts.lignesBrouillon === null
              ? null
              : {
                  lignes: (opts.lignesBrouillon ?? [[1, 100_000]]).map(([q, p]) => ({
                    quantite: { toNumber: () => q },
                    prixUnitaire: { toNumber: () => p },
                  })),
                },
        ),
      ),
      findMany: jest.fn().mockResolvedValue(opts.offres ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    projet: {
      create: jest.fn().mockResolvedValue({ id: 'P1', client: DOSSIER.client, cellules: [] }),
    },
    // Factures directes du lead, rattachées au projet à l'Onboard.
    facture: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  // Émission de l'offre simulée : exécute la bascule du dossier dans « sa »
  // transaction, comme DevisService.emettreOffre.
  const devis = {
    emettreOffre: jest.fn(async (_s: string, _d: string, dansTx: (tx: unknown) => Promise<void>) => {
      await dansTx(prisma);
      return { reference: 'DEV2026-0001', lienPublic: 'http://x/devis/t', emailEnvoye: false };
    }),
  };
  const facturation = { preparerDepuisOffre: jest.fn().mockResolvedValue(4), figerPartsOffres: jest.fn() };
  const notifications = {
    notifierDossierCrm: jest.fn().mockResolvedValue(undefined),
    envoyer: jest.fn().mockResolvedValue(undefined),
    titulairesRole: jest.fn().mockResolvedValue(['UCEO']),
  };
  return {
    prisma,
    devis,
    facturation,
    notifications,
    svc: new CrmService(
      prisma as unknown as PrismaService,
      devis as unknown as DevisService,
      facturation as unknown as FacturationService,
      notifications as unknown as NotificationsService,
      {
        verifierOffreDossier: jest.fn().mockResolvedValue(undefined),
        offreAuDelaDuSeuil: jest.fn().mockResolvedValue(null),
      } as unknown as SeuilCeoService,
      new OnboardingService(facturation as unknown as FacturationService),
    ),
  };
}

const COO = { userId: 'U-COO', role: 'COO', permissions: { crm: 'ecriture' } } as const;
const CFO = {
  userId: 'U-CFO',
  role: 'CFO',
  permissions: { crm: 'lecture', finances_devis: 'validation' },
} as const;
const DIR_GC = {
  userId: 'U-DG',
  role: 'Dir. GC',
  permissions: { crm: 'ecriture', finances_devis: 'ecriture' },
} as const;

describe('Cycle CRM — règles', () => {
  it('onboard et perdu sont définitifs (aucune action n’en part)', () => {
    for (const regle of Object.values(REGLES_ACTIONS)) {
      expect(regle.de).not.toContain('onboard');
      expect(regle.de).not.toContain('perdu');
    }
  });
});

describe('CrmService.agir', () => {
  it('soumettre : nouveau_projet → en_validation, journalisé avec l’auteur', async () => {
    const { svc, prisma, notifications, facturation } = monter('nouveau_projet');
    await svc.agir('S1', COO as never, 'D1', 'soumettre', undefined);
    // L'offre fige ses parts F1 / F2 / F3 (Réglages) dans la transaction.
    expect(facturation.figerPartsOffres).toHaveBeenCalledWith(expect.anything(), 'S1', 'D1');
    // La DAF est prévenue, APRÈS la transaction, l'auteur exclu en aval.
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'dossier_soumis',
      parId: 'U-COO',
      commentaire: null,
    });
    expect(prisma.dossierCrm.updateMany).toHaveBeenCalledWith({
      where: { id: 'D1', statut: 'nouveau_projet' },
      data: { statut: 'en_validation' },
    });
    expect(prisma.dossierCrmTransition.create).toHaveBeenCalledWith({
      data: {
        dossierId: 'D1',
        de: 'nouveau_projet',
        vers: 'en_validation',
        parId: 'U-COO',
        commentaire: null,
      },
    });
  });

  it('soumettre une fiche incomplète → 409, rien ne bascule (elle se verrouillerait incomplète)', async () => {
    const { svc, prisma } = monter('nouveau_projet');
    prisma.dossierCrm.findFirst.mockResolvedValue({
      ...DOSSIER,
      statut: 'nouveau_projet',
      gamme: null,
      nbPlanches: 0,
      projet: null,
    });
    await expect(svc.agir('S1', COO as never, 'D1', 'soumettre', undefined)).rejects.toThrow(
      'Fiche 8/10 : il manque n° de planches, gamme',
    );
    expect(prisma.dossierCrm.updateMany).not.toHaveBeenCalled();
  });

  it('valider : la DAF (finances_devis validation) passe et ENVOIE l’offre', async () => {
    const { svc, prisma, devis, notifications } = monter('en_validation');
    const r = await svc.agir('S1', CFO as never, 'D1', 'valider', undefined);
    expect(devis.emettreOffre).toHaveBeenCalledTimes(1);
    // Offre partie chez le client : le propriétaire est prévenu (14/10/2026).
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith(
      expect.objectContaining({ evenement: 'offre_envoyee' }),
    );
    expect(prisma.dossierCrm.updateMany.mock.calls[0][0].data).toEqual({
      statut: 'offre_envoyee',
    });
    expect(r.offreEmise).toMatchObject({ lienPublic: 'http://x/devis/t' });
  });

  it('valider : Dir. GC (finances_devis écriture seulement) → 403, rien écrit', async () => {
    const { svc, prisma } = monter('en_validation');
    await expect(svc.agir('S1', DIR_GC as never, 'D1', 'valider', undefined)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('soumettre : la CFO (crm lecture) → 403', async () => {
    const { svc } = monter('nouveau_projet');
    await expect(svc.agir('S1', CFO as never, 'D1', 'soumettre', undefined)).rejects.toThrow(ForbiddenException);
  });

  it('renvoyer sans commentaire → 400 ; avec → retour à nouveau_projet', async () => {
    const vide = monter('en_validation');
    await expect(vide.svc.agir('S1', CFO as never, 'D1', 'renvoyer', '   ')).rejects.toThrow(BadRequestException);
    const ok = monter('en_validation');
    await ok.svc.agir('S1', CFO as never, 'D1', 'renvoyer', ' Chiffrage à revoir ');
    expect(ok.prisma.dossierCrmTransition.create.mock.calls[0][0].data).toMatchObject({
      vers: 'nouveau_projet',
      commentaire: 'Chiffrage à revoir',
    });
    expect(vide.notifications.notifierDossierCrm).not.toHaveBeenCalled();
    expect(ok.notifications.notifierDossierCrm).toHaveBeenCalledWith(
      expect.objectContaining({ evenement: 'dossier_renvoye', commentaire: 'Chiffrage à revoir' }),
    );
  });

  it('perdre sans motif → 400 ; depuis onboard → 409 (définitif)', async () => {
    const { svc } = monter('offre_envoyee');
    await expect(svc.agir('S1', COO as never, 'D1', 'perdre', undefined)).rejects.toThrow('motif est obligatoire');
    const fini = monter('onboard');
    await expect(fini.svc.agir('S1', COO as never, 'D1', 'perdre', 'x')).rejects.toThrow(ConflictException);
  });

  it('étape sautée (onboarder depuis nouveau_projet) → 409', async () => {
    const { svc } = monter('nouveau_projet');
    await expect(svc.agir('S1', COO as never, 'D1', 'onboarder', undefined)).rejects.toThrow(ConflictException);
  });

  it('statut changé entre-temps (concurrence) → 409, pas de journal', async () => {
    const { svc, prisma } = monter('nouveau_projet', { basculees: 0 });
    await expect(svc.agir('S1', COO as never, 'D1', 'soumettre', undefined)).rejects.toThrow('vient de changer');
    expect(prisma.dossierCrmTransition.create).not.toHaveBeenCalled();
  });

  it('onboarder à la main → 409 : l’Onboard se fait à l’acceptation de l’offre', async () => {
    const { svc, prisma } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'accepte', dateValidite: '2026-01-10' }],
    });
    await expect(svc.agir('S1', COO as never, 'D1', 'onboarder', undefined)).rejects.toThrow('acceptation de l’offre');
    expect(prisma.projet.create).not.toHaveBeenCalled();
  });

  it('offre acceptée en attente débloquée : bascule + projet + factures, une transaction', async () => {
    const { svc, prisma, facturation, notifications } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'accepte', dateValidite: '2026-01-10' }],
    });
    const tracer = jest.fn().mockResolvedValue(undefined);
    const r = await svc.onboarderOffreAcceptee('S1', 'D1', 'ADM', 'motif', tracer);
    expect(tracer).toHaveBeenCalledWith(prisma);
    expect(prisma.dossierCrmTransition.create.mock.calls[0][0].data).toMatchObject({
      de: 'offre_envoyee',
      vers: 'onboard',
      parId: 'ADM',
      commentaire: 'motif',
    });
    expect(prisma.projet.create).toHaveBeenCalledTimes(1);
    // Factures directes du lead (sans offre) rattachées au projet ouvert.
    expect(prisma.facture.updateMany).toHaveBeenCalledWith({
      where: { dossierCrmId: 'D1', projetId: null },
      data: { projetId: 'P1' },
    });
    expect(prisma.devis.update).toHaveBeenCalledWith({
      where: { id: 'O1' },
      data: { projetId: 'P1', statut: 'transforme' },
    });
    // Même transaction (tx = prisma simulé) que la création du projet.
    expect(facturation.preparerDepuisOffre).toHaveBeenCalledWith(
      prisma,
      'S1',
      { id: 'P1', nature: 'mandat_client' },
      'O1',
    );
    expect(r.projet).not.toBeNull();
    expect(r.facturesPreparees).toBe(4);
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'D1',
      evenement: 'offre_acceptee',
      parId: 'ADM',
      projetId: 'P1',
      facturesPreparees: 4,
    });
  });
});

// Conditions posées par l'offre du dossier (étape F).
describe('CrmService.agir — offre', () => {
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it('soumettre sans prestation chiffrée → 409', async () => {
    for (const lignesBrouillon of [null, [], [[1, 0]]] as ([number, number][] | null)[]) {
      const { svc, prisma } = monter('nouveau_projet', { lignesBrouillon });
      await expect(svc.agir('S1', COO as never, 'D1', 'soumettre', undefined)).rejects.toThrow(
        'au moins une prestation chiffrée',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it('soumettre avec une ligne pas encore chiffrée (brouillon tolérant) → 409', async () => {
    const { svc, prisma } = monter('nouveau_projet', {
      lignesBrouillon: [
        [1, 100_000],
        [0, 5_000],
      ],
    });
    await expect(svc.agir('S1', COO as never, 'D1', 'soumettre', undefined)).rejects.toThrow(
      'une ligne n’est pas chiffrée',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('Onboard sans offre acceptée → 409, aucun projet', async () => {
    const { svc, prisma } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'envoye', dateValidite: demain }],
    });
    await expect(svc.onboarderOffreAcceptee('S1', 'D1', null, 'x', jest.fn())).rejects.toThrow('offre acceptée');
    expect(prisma.projet.create).not.toHaveBeenCalled();
  });

  it('refaire tant que l’offre attend une réponse → 409', async () => {
    const { svc } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'envoye', dateValidite: demain }],
    });
    await expect(svc.agir('S1', COO as never, 'D1', 'refaire', undefined)).rejects.toThrow('attend encore la réponse');
  });

  it('refaire une offre acceptée → 409 (passer en Onboard)', async () => {
    const { svc } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'accepte', dateValidite: demain }],
    });
    await expect(svc.agir('S1', COO as never, 'D1', 'refaire', undefined)).rejects.toThrow('acceptée');
  });

  it('refaire une offre expirée → retour en nouveau_projet', async () => {
    const { svc, prisma } = monter('offre_envoyee', {
      offres: [{ id: 'O1', statut: 'envoye', dateValidite: '2026-01-10' }],
    });
    await svc.agir('S1', COO as never, 'D1', 'refaire', undefined);
    expect(prisma.dossierCrm.updateMany.mock.calls[0][0].data).toEqual({
      statut: 'nouveau_projet',
    });
  });
});
