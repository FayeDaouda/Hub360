import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { OnboardingService } from '../crm/onboarding.service';
import { EmailService } from '../email/email.service';
import { FacturationService } from '../projets/facturation/facturation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { DevisService } from './devis.service';

// Remise sur toute l'offre (09/11/2026), au niveau du SERVICE : la règle pure
// (htLigne, montantTtcLignes) est couverte par domaine.spec.ts ; ici, ce que
// l'écran et le client reçoivent (patch, lien public) et la facture issue
// d'une conversion.

const dec = (n: number) => ({ toNumber: () => n });

// CO : 300 m² (100 m² × 3 planches) à 5 000 = 1 500 000 HT brut ;
// SU : 3 mois à 300 000 = 900 000 HT brut. TVA 18 % partout.
const LIGNE_CO = {
  id: 'L-CO',
  produitServiceId: 'CO1',
  designation: 'CO1 — Conception — faible complexité',
  surfaceM2: 100,
  planches: 3,
  quantite: dec(300),
  prixUnitaire: dec(5000),
  tauxTva: dec(18),
  ordre: 0,
  produitService: { famille: 'CO', code: 'CO1' },
};
const LIGNE_SU = {
  id: 'L-SU',
  produitServiceId: 'SU1',
  designation: 'SU1 — Suivi de chantier — projet simple',
  surfaceM2: null,
  planches: null,
  quantite: dec(3),
  prixUnitaire: dec(300000),
  tauxTva: dec(18),
  ordre: 1,
  produitService: { famille: 'SU', code: 'SU1' },
};

function offreRow(o: Record<string, unknown> = {}) {
  return {
    id: 'D1',
    societeId: 'S1',
    numero: null,
    codeDossier: 'DF_ALM.26',
    rangDossier: 1,
    statut: 'brouillon',
    objet: '',
    clientId: 'C1',
    projetId: null,
    dossierCrmId: 'DOS1',
    dateValidite: null,
    dateEnvoi: null,
    dateReponse: null,
    tokenPublicHash: null,
    relancesEnvoyees: 0,
    derniereRelanceLe: null,
    messageIntroduction: null,
    delaisEcheancier: null,
    // Parts figées : l'échéancier ne lit pas le réglage en service.
    partsFactures: { F1: 40, F2: 40, F3: 20 },
    remisePct: null as number | null,
    creeLe: new Date('2026-11-09T10:00:00Z'),
    client: { id: 'C1', numero: 1, nom: 'Client X', type: 'particulier', email: null, adresse: '' },
    societe: { nom: 'Grey Concrete' },
    dossierCrm: {
      id: 'DOS1',
      statut: 'nouveau_projet',
      code: 'DF_ALM.26',
      archiveLe: null,
      localisation: 'Almadies',
      programme: 'Villa R+2',
      localite: null,
    },
    lignes: [LIGNE_CO, LIGNE_SU],
    ...o,
  };
}

function monter(row: ReturnType<typeof offreRow>) {
  // La base « applique » l'écriture : le devis relu porte la remise reçue.
  const update = jest.fn(({ data }: { data: { remisePct?: number | null } }) =>
    Promise.resolve({ ...row, ...(data.remisePct !== undefined && { remisePct: data.remisePct }) }),
  );
  const trace = jest.fn();
  const tx = { devis: { update }, client: { update: jest.fn() }, dossierCrmTransition: { create: trace } };
  const prisma = {
    devis: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  const facturation = { creerDepuisDevis: jest.fn().mockResolvedValue('F-NEW') };
  const reglages = {
    regle: jest.fn().mockResolvedValue(7),
    partsFactures: jest.fn().mockResolvedValue({ F1: 40, F2: 40, F3: 20 }),
  };
  const service = new DevisService(
    prisma,
    facturation as unknown as FacturationService,
    {} as EmailService,
    {} as NotificationsService,
    reglages as unknown as ReglagesService,
    {} as OnboardingService,
  );
  return { service, update, prisma, facturation, trace };
}

describe('DevisService.patch — remise de l’offre', () => {
  it('trace la remise posée dans l’historique du dossier, au nom de qui la pose', async () => {
    const { service, trace } = monter(offreRow());
    await service.patch('S1', 'D1', { remisePct: 15 }, 'U-DIRGC');
    expect(trace).toHaveBeenCalledWith({
      data: {
        dossierId: 'DOS1',
        de: 'nouveau_projet',
        vers: 'nouveau_projet',
        parId: 'U-DIRGC',
        commentaire: 'Remise de l’offre : 15 % (avant : aucune)',
      },
    });
  });

  it('remise inchangée ou absente du patch : aucune trace', async () => {
    const { service, trace } = monter(offreRow({ remisePct: 10 }));
    await service.patch('S1', 'D1', { remisePct: 10 }, 'U1');
    await service.patch('S1', 'D1', { objet: 'Villa' }, 'U1');
    expect(trace).not.toHaveBeenCalled();
  });

  it('remise retirée : tracée aussi', async () => {
    const { service, trace } = monter(offreRow({ remisePct: 20 }));
    await service.patch('S1', 'D1', { remisePct: null }, 'U1');
    expect(trace.mock.calls[0][0].data.commentaire).toBe('Remise de l’offre : aucune (avant : 20 %)');
  });

  it('enregistre la remise sur le brouillon d’une offre de lead', async () => {
    const { service, update } = monter(offreRow());
    await service.patch('S1', 'D1', { remisePct: 10 });
    expect(update.mock.calls[0][0].data.remisePct).toBe(10);
  });

  it('renvoie des totaux remisés tandis que chaque ligne garde son HT brut', async () => {
    const { service } = monter(offreRow());
    const res = await service.patch('S1', 'D1', { remisePct: 10 });
    expect(res).toMatchObject({
      remisePct: 10,
      montantBrutHt: 2_400_000,
      montantRemise: 240_000,
      montantHt: 2_160_000,
      // TVA sur le HT remisé : 243 000 (CO) + 145 800 (SU).
      montantTva: 388_800,
      montantTtc: 2_548_800,
    });
    const [co, su] = res.lignes;
    expect(co).toMatchObject({ montantHt: 1_500_000, montantTva: 243_000, montantTtc: 1_593_000 });
    expect(su).toMatchObject({ montantHt: 900_000, montantTva: 145_800, montantTtc: 955_800 });
  });

  it('l’échéancier de l’offre suit le HT remisé : sa somme TTC égale le TTC de l’offre', async () => {
    const { service } = monter(offreRow());
    const res = await service.patch('S1', 'D1', { remisePct: 10 });
    const tranchesCo = res.echeancier!.filter((e) => e.cle?.startsWith('CO:')).map((e) => e.montantTtc);
    // 1 350 000 HT remisé → 40 / 40 / 20 % → TTC.
    expect(tranchesCo).toEqual([637_200, 637_200, 318_600]);
    expect(res.echeancier!.reduce((s, e) => s + e.montantTtc, 0)).toBe(res.montantTtc);
  });

  it('arrondit la remise au franc ligne par ligne, et la remise affichée réconcilie brut et HT', async () => {
    const ligneImpaire = (id: string, ordre: number) => ({
      ...LIGNE_SU,
      id,
      produitServiceId: null,
      produitService: null,
      quantite: dec(1),
      prixUnitaire: dec(33_333),
      ordre,
    });
    const { service } = monter(offreRow({ lignes: [ligneImpaire('A', 0), ligneImpaire('B', 1)] }));
    const res = await service.patch('S1', 'D1', { remisePct: 5 });
    // 33 333 × 95 % = 31 666,35 → 31 666 par ligne (et non 63 333 sur le total).
    expect(res).toMatchObject({ montantBrutHt: 66_666, montantHt: 63_332, montantRemise: 3_334 });
  });

  it('remise retirée (null) : totaux bruts, remise nulle', async () => {
    const { service, update } = monter(offreRow({ remisePct: 10 }));
    const res = await service.patch('S1', 'D1', { remisePct: null });
    expect(update.mock.calls[0][0].data.remisePct).toBeNull();
    expect(res).toMatchObject({ remisePct: null, montantBrutHt: 2_400_000, montantRemise: 0, montantHt: 2_400_000 });
  });

  it('refuse la remise sur un devis hors lead (422), sans rien écrire', async () => {
    const { service, update } = monter(offreRow({ dossierCrmId: null, dossierCrm: null, codeDossier: null }));
    await expect(service.patch('S1', 'D1', { remisePct: 10 })).rejects.toThrow(UnprocessableEntityException);
    await expect(service.patch('S1', 'D1', { remisePct: 10 })).rejects.toThrow('remise');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuse la remise une fois l’offre soumise au CFO (409) : elle est figée', async () => {
    const row = offreRow();
    const { service, update } = monter({ ...row, dossierCrm: { ...row.dossierCrm, statut: 'en_validation' } });
    await expect(service.patch('S1', 'D1', { remisePct: 10 })).rejects.toThrow(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuse la remise sur une offre déjà envoyée (409)', async () => {
    const { service, update } = monter(offreRow({ statut: 'envoye' }));
    await expect(service.patch('S1', 'D1', { remisePct: 10 })).rejects.toThrow(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DevisService.getPublic — remise vue par le client', () => {
  it('expose le taux, le HT brut, la remise et les totaux remisés', async () => {
    const row = offreRow({
      statut: 'envoye',
      remisePct: 10,
      dateValidite: '2999-12-31',
      societe: {
        nom: 'Grey Concrete',
        logoUrl: null,
        logoUrlSombre: null,
        couleurMarque: null,
        icone: null,
        mentionsLegales: null,
        coordonnees: null,
      },
    });
    const { service } = monter(row);
    const res = await service.getPublic('jeton');
    expect(res).toMatchObject({
      remisePct: 10,
      montantBrutHt: 2_400_000,
      montantRemise: 240_000,
      montantHt: 2_160_000,
      montantTva: 388_800,
      montantTtc: 2_548_800,
    });
    expect(res.lignes.map((l) => l.montantHt)).toEqual([1_500_000, 900_000]);
  });
});

describe('DevisService.convertir — devis remisé', () => {
  it('la facture issue de la conversion porte le HT remisé', async () => {
    const { service, facturation, prisma } = monter(offreRow({ statut: 'accepte', remisePct: 10 }));
    const res = await service.convertir('S1', 'D1', 'U1');
    expect(facturation.creerDepuisDevis).toHaveBeenCalledWith(
      'S1',
      expect.objectContaining({ montantHt: 2_160_000, tauxTva: 18, devisOrigineId: 'D1' }),
      'U1',
    );
    expect(prisma.devis.update).toHaveBeenCalledWith({ where: { id: 'D1' }, data: { statut: 'transforme' } });
    expect(res.factureId).toBe('F-NEW');
  });

  it('taux de TVA effectif calculé sur les montants remisés (lignes à taux mixtes)', async () => {
    const exoneree = { ...LIGNE_SU, tauxTva: dec(0) };
    const { service, facturation } = monter(
      offreRow({ statut: 'accepte', remisePct: 20, lignes: [LIGNE_CO, exoneree] }),
    );
    await service.convertir('S1', 'D1', 'U1');
    // HT remisé : 1 200 000 + 720 000 ; TVA : 216 000 → 216 000 / 1 920 000 = 11,25 %.
    expect(facturation.creerDepuisDevis).toHaveBeenCalledWith(
      'S1',
      expect.objectContaining({ montantHt: 1_920_000, tauxTva: 11.25 }),
      'U1',
    );
  });
});
