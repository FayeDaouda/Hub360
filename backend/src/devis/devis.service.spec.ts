import { OnboardingService } from '../crm/onboarding.service';
import { EmailService } from '../email/email.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { DevisService } from './devis.service';

// DevisService.envoyer() : le client CRM n'a pas forcément d'email — dans ce
// cas on ne doit MÊME PAS tenter l'envoi (ce n'est pas un échec de transport,
// juste rien à transmettre). Le transport « log » du dev renvoie toujours
// { envoye: false } qu'on ait tenté ou non — un test en conditions réelles ne
// peut donc pas distinguer les deux chemins, seul un mock le peut.

const dec = (n: number) => ({ toNumber: () => n }) as unknown as { toNumber(): number };

function ligne() {
  return {
    id: 'L1',
    produitServiceId: null,
    designation: 'Prestation',
    quantite: dec(1),
    prixUnitaire: dec(100000),
    tauxTva: dec(18),
    ordre: 0,
  };
}

function devisRow(clientEmail: string | null) {
  return {
    id: 'D1',
    societeId: 'S1',
    projetId: null,
    numero: null,
    statut: 'brouillon' as const,
    objet: '',
    dateValidite: null,
    dateEnvoi: null,
    dateReponse: null,
    tokenPublicHash: null,
    creeLe: new Date(),
    client: { id: 'C1', nom: 'Client X', email: clientEmail },
    societe: { nom: 'Grey Concrete' },
    lignes: [ligne()],
  };
}

function setup(clientEmail: string | null) {
  const row = devisRow(clientEmail);
  const findFirst = jest.fn().mockResolvedValue(row);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const aggregate = jest.fn().mockResolvedValue({ _max: { numero: null } });
  const devis = { findFirst, updateMany, aggregate };
  const prisma = {
    devis,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ devis })),
  } as unknown as PrismaService;

  const envoyerDevis = jest.fn().mockResolvedValue({ envoye: true });
  const email = { envoyerDevis } as unknown as EmailService;
  const facturation = {} as unknown as FacturationService;

  const service = new DevisService(
    prisma,
    facturation,
    email,
    {} as NotificationsService,
    { regle: jest.fn().mockResolvedValue(7) } as unknown as ReglagesService,
    {} as OnboardingService,
  );
  return { service, envoyerDevis, findFirst };
}

describe('DevisService.envoyer — envoi email', () => {
  it('client AVEC email : envoyerDevis est appelé avec les bonnes infos, emailEnvoye reflète le résultat', async () => {
    const { service, envoyerDevis } = setup('client@exemple.sn');
    const res = await service.envoyer('S1', 'D1');
    expect(envoyerDevis).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'client@exemple.sn',
        clientNom: 'Client X',
        societeNom: 'Grey Concrete',
      }),
    );
    expect(res.emailEnvoye).toBe(true);
  });

  it('client SANS email : envoyerDevis n’est JAMAIS appelé (rien à transmettre, pas un échec) — emailEnvoye = false', async () => {
    const { service, envoyerDevis } = setup(null);
    const res = await service.envoyer('S1', 'D1');
    expect(envoyerDevis).not.toHaveBeenCalled();
    expect(res.emailEnvoye).toBe(false);
  });

  it('échec de transport (client avec email mais envoi qui échoue) : emailEnvoye = false, le lien reste renvoyé', async () => {
    const { service, envoyerDevis } = setup('client@exemple.sn');
    envoyerDevis.mockResolvedValue({ envoye: false });
    const res = await service.envoyer('S1', 'D1');
    expect(res.emailEnvoye).toBe(false);
    expect(res.lienPublic).toEqual(expect.stringContaining('/devis/'));
  });
});

// Offre d'un dossier CRM (étape F).
describe('DevisService — offre de dossier CRM', () => {
  function monterOffre(statut: 'brouillon' | 'envoye', dateValidite: string | null = null) {
    const row = {
      ...devisRow('client@exemple.sn'),
      statut,
      dateValidite,
      dossierCrmId: 'DOS1',
      dossierCrm: { id: 'DOS1', statut: 'offre_envoyee', code: 'DF_ALM.26' },
      relancesEnvoyees: 0,
      derniereRelanceLe: null,
    };
    const tx = {
      devis: { update: jest.fn().mockResolvedValue({ societeId: 'S1' }) },
      dossierCrm: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ statut: 'offre_envoyee' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dossierCrmTransition: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      devis: { findFirst: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const notifications = { notifierDossierCrm: jest.fn().mockResolvedValue(undefined) };
    const onboarding = {
      onboard: jest.fn().mockResolvedValue({ projet: { id: 'P1' }, facturesPreparees: 3 }),
      openIfDue: jest.fn().mockResolvedValue(true),
    };
    const service = new DevisService(
      prisma,
      {} as FacturationService,
      { envoyerDevis: jest.fn() } as unknown as EmailService,
      notifications as unknown as NotificationsService,
      { regle: jest.fn().mockResolvedValue(7) } as unknown as ReglagesService,
      onboarding as unknown as OnboardingService,
    );
    return { service, tx, notifications, onboarding };
  }

  it('envoi direct d’une offre (hors validation DAF) → 409', async () => {
    const { service } = monterOffre('brouillon');
    await expect(service.envoyer('S1', 'D1')).rejects.toThrow('validation de la DAF');
  });

  it('refus du client par le lien → dossier perdu, motif posé, auteur null', async () => {
    const { service, tx, notifications } = monterOffre('envoye', '2999-12-31');
    await service.repondrePublic('jeton', 'refuse');
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'DOS1',
      evenement: 'offre_refusee',
      parId: null,
      projetId: null,
    });
    expect(tx.dossierCrm.updateMany).toHaveBeenCalledWith({
      where: { id: 'DOS1', statut: 'offre_envoyee' },
      data: { statut: 'perdu' },
    });
    expect(tx.dossierCrmTransition.create.mock.calls[0][0].data).toMatchObject({
      de: 'offre_envoyee',
      vers: 'perdu',
      parId: null,
      commentaire: 'Offre refusée par le client.',
    });
  });

  it('acceptation du client → Onboard dans la même transaction, projet et factures notifiés', async () => {
    const { service, tx, notifications, onboarding } = monterOffre('envoye', '2999-12-31');
    await service.repondrePublic('jeton', 'accepte');
    expect(tx.devis.update).toHaveBeenCalled();
    expect(onboarding.onboard).toHaveBeenCalledWith(tx, 'S1', 'DOS1', null, 'offre acceptée par le client');
    // Le projet s'ouvre aussitôt après (gabarit, J1) : visible dans Projets.
    expect(onboarding.openIfDue).toHaveBeenCalledWith('S1', 'P1');
    expect(notifications.notifierDossierCrm).toHaveBeenCalledWith({
      societeId: 'S1',
      dossierId: 'DOS1',
      evenement: 'offre_acceptee',
      parId: null,
      projetId: 'P1',
      facturesPreparees: 3,
    });
    expect(tx.dossierCrm.updateMany).not.toHaveBeenCalled();
  });

  it('acceptation sur un dossier déclaré perdu entre-temps → pas d’Onboard', async () => {
    const { service, tx, onboarding } = monterOffre('envoye', '2999-12-31');
    tx.dossierCrm.findUniqueOrThrow.mockResolvedValue({ statut: 'perdu' });
    await service.repondrePublic('jeton', 'accepte');
    expect(tx.devis.update).toHaveBeenCalled();
    expect(onboarding.onboard).not.toHaveBeenCalled();
  });
});

// Règles du catalogue réel appliquées côté serveur (DevisService.appliquerCatalogue).
describe('DevisService — catalogue réel', () => {
  const produit = (o: { id: string; code?: string } & Record<string, unknown>) => ({
    societeId: 'S1',
    famille: null,
    coAssocie: null,
    modeCalcul: 'quantite',
    prixModifiable: false,
    tauxTva: dec(18),
    ...o,
  });
  const LIBRE = { offreDossier: false, categorieCo: null, devisProjet: false };
  const PROJET_CO2 = { offreDossier: false, categorieCo: 'CO2', devisProjet: true };
  // Offre d'un lead : brouillon tolérant.
  const OFFRE = { offreDossier: true, categorieCo: null, devisProjet: false };
  const CATALOGUE = [
    produit({ id: 'CO1', code: 'CO1', famille: 'CO', modeCalcul: 'surface_planches', prixUnitaire: dec(5000) }),
    produit({ id: 'CO2', code: 'CO2', famille: 'CO', modeCalcul: 'surface_planches', prixUnitaire: dec(7000) }),
    produit({ id: 'SU1', code: 'SU1', famille: 'SU', coAssocie: 'CO1', prixUnitaire: dec(300000) }),
    produit({ id: 'SU2', code: 'SU2', famille: 'SU', coAssocie: 'CO2', prixUnitaire: dec(500000) }),
    produit({ id: 'DPC', code: 'DPC', famille: 'PC', modeCalcul: 'forfait', prixModifiable: true, prixUnitaire: null }),
    produit({ id: 'TS-MIN', code: 'TS-MIN', famille: 'TS', prixUnitaire: dec(100000) }),
    produit({
      id: 'TS-MAJ',
      code: 'TS-MAJ',
      famille: 'TS',
      modeCalcul: 'tarif_co_surface_planches',
      prixUnitaire: null,
    }),
  ];
  const service = new DevisService(
    {
      produitService: {
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(CATALOGUE.filter((p) => where.id.in.includes(p.id))),
        ),
        // Tarif CO de la catégorie du projet (TS-MAJ).
        findFirst: jest.fn(({ where }: { where: { code: string } }) =>
          Promise.resolve(CATALOGUE.find((p) => p.code === where.code) ?? null),
        ),
      },
    } as unknown as PrismaService,
    {} as FacturationService,
    {} as EmailService,
    {} as NotificationsService,
    { regle: jest.fn().mockResolvedValue(7) } as unknown as ReglagesService,
    {} as OnboardingService,
  ) as unknown as {
    appliquerCatalogue: (
      s: string,
      l: object[],
      ctx: { offreDossier: boolean; categorieCo: string | null; devisProjet: boolean },
    ) => Promise<{ quantite: number; prixUnitaire: number; surfaceM2: number | null; planches: number | null }[]>;
  };
  const ligne = (o: object) => ({ designation: 'x', quantite: 1, prixUnitaire: 1, ...o });

  it('CO : tarif imposé, quantité = surface × planches saisies (pré-remplies depuis la fiche à l’écran)', async () => {
    const [l] = await service.appliquerCatalogue(
      'S1',
      [ligne({ produitServiceId: 'CO1', surfaceM2: 250, planches: 3, prixUnitaire: 1 })],
      OFFRE,
    );
    expect(l).toMatchObject({ prixUnitaire: 5000, surfaceM2: 250, planches: 3, quantite: 750 });
  });

  it('CO sans surface ou sans planches : 422 sur un devis, 0 sur le brouillon d’une offre de lead', async () => {
    await expect(
      service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'CO1', planches: 2 })], LIBRE),
    ).rejects.toThrow('surface (m²) requise');
    await expect(
      service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'CO1', surfaceM2: 100 })], LIBRE),
    ).rejects.toThrow('nombre de planches requis');
    const [brouillon] = await service.appliquerCatalogue(
      'S1',
      [ligne({ produitServiceId: 'CO1', surfaceM2: 100 })],
      OFFRE,
    );
    expect(brouillon).toMatchObject({ prixUnitaire: 5000, surfaceM2: 100, planches: null, quantite: 0 });
  });

  it('quantité 0 : refusée sur un devis, tolérée sur le brouillon d’une offre de lead', async () => {
    await expect(
      service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'TS-MIN', quantite: 0 })], PROJET_CO2),
    ).rejects.toThrow('quantité requise');
    await expect(service.appliquerCatalogue('S1', [ligne({ quantite: 0 })], LIBRE)).rejects.toThrow('quantité requise');
    const [l] = await service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'DPC', quantite: 0 })], OFFRE);
    expect(l.quantite).toBe(0);
  });

  it('deux lignes CO → 422', async () => {
    await expect(
      service.appliquerCatalogue(
        'S1',
        [ligne({ produitServiceId: 'CO1', surfaceM2: 1 }), ligne({ produitServiceId: 'CO2', surfaceM2: 1 })],
        OFFRE,
      ),
    ).rejects.toThrow('Une seule ligne de conception');
  });

  it('SU : doit suivre la catégorie CO (jamais choisi) — SU2 avec CO1 → 422 ; SU1 → prix imposé', async () => {
    await expect(
      service.appliquerCatalogue(
        'S1',
        [ligne({ produitServiceId: 'CO1', surfaceM2: 1 }), ligne({ produitServiceId: 'SU2', quantite: 3 })],
        OFFRE,
      ),
    ).rejects.toThrow('ne correspond pas à la catégorie CO1');
    const [, su] = await service.appliquerCatalogue(
      'S1',
      [
        ligne({ produitServiceId: 'CO1', surfaceM2: 1 }),
        ligne({ produitServiceId: 'SU1', quantite: 3, prixUnitaire: 1 }),
      ],
      OFFRE,
    );
    expect(su).toMatchObject({ prixUnitaire: 300000, quantite: 3 });
  });

  it('SU sans ligne CO : catégorie figée du dossier, sinon 422', async () => {
    const [su] = await service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'SU2', quantite: 2 })], {
      ...OFFRE,
      categorieCo: 'CO2',
    });
    expect(su.prixUnitaire).toBe(500000);
    await expect(service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'SU1' })], LIBRE)).rejects.toThrow(
      'ajoute d’abord la ligne CO',
    );
  });

  it('TS hors devis de projet (offre CRM, devis libre) → 422', async () => {
    await expect(service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'TS-MIN' })], LIBRE)).rejects.toThrow(
      'devis complémentaire rattaché au projet',
    );
  });

  it('TS-MIN : forfait figé 100 000 × nombre de reprises', async () => {
    const [ts] = await service.appliquerCatalogue(
      'S1',
      [ligne({ produitServiceId: 'TS-MIN', quantite: 2, prixUnitaire: 1 })],
      PROJET_CO2,
    );
    expect(ts).toMatchObject({ prixUnitaire: 100000, quantite: 2 });
  });

  it('TS-MAJ : tarif CO DU PROJET × surface × planches concernées', async () => {
    const [ts] = await service.appliquerCatalogue(
      'S1',
      [ligne({ produitServiceId: 'TS-MAJ', surfaceM2: 80, planches: 1, prixUnitaire: 1 })],
      PROJET_CO2,
    );
    expect(ts).toMatchObject({ prixUnitaire: 7000, surfaceM2: 80, planches: 1, quantite: 80 });
  });

  it('TS-MAJ sans catégorie CO connue, ou sans surface / planches → 422', async () => {
    await expect(
      service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'TS-MAJ', surfaceM2: 80, planches: 1 })], {
        ...PROJET_CO2,
        categorieCo: null,
      }),
    ).rejects.toThrow('catégorie de conception');
    await expect(
      service.appliquerCatalogue('S1', [ligne({ produitServiceId: 'TS-MAJ', surfaceM2: 80 })], PROJET_CO2),
    ).rejects.toThrow('planches concernées');
  });

  it('forfait (DPC) : prix saisi conservé ; ligne hors catalogue : telle quelle', async () => {
    const [dpc, libre] = await service.appliquerCatalogue(
      'S1',
      [ligne({ produitServiceId: 'DPC', prixUnitaire: 750000 }), ligne({ prixUnitaire: 42, quantite: 2 })],
      LIBRE,
    );
    expect(dpc.prixUnitaire).toBe(750000);
    expect(libre).toMatchObject({ prixUnitaire: 42, quantite: 2 });
  });
});
