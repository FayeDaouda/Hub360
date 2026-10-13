import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { FacturationService } from './facturation.service';
import { OuvertureProjetService } from '../gabarit/ouverture.service';
import { SeuilCeoService } from '../../finances/seuil-ceo.service';
import { NotificationsService } from '../../notifications/notifications.service';

// Ouverture selon le gabarit : sans objet ici (aucune F1 d'un projet à gabarit).
// Notification « facture à valider » : sans objet ici.
const NOTIFS = { notifierFactureAValider: jest.fn() } as unknown as NotificationsService;
// Montant de l'affaire : la facture elle-même (sans offre), suffisant ici.
const SEUIL_CEO = { montantsAffaire: jest.fn().mockImplementation((fs: { id: string }[]) => Promise.resolve(new Map(fs.map((f) => [f.id, 0])))) } as unknown as SeuilCeoService;
const OUVERTURE = { preparer: jest.fn().mockResolvedValue(null), enregistrer: jest.fn() } as unknown as OuvertureProjetService;

// FacturationService.relancer() — relance MANUELLE d'une facture en retard
// (cf. cadrage « Devis » §Zervant : pas de scheduler dans ce backend, donc
// pas de relance automatique — l'admin déclenche lui-même). Trois axes :
// hors périmètre (pas en retard), donnée manquante (pas d'email), et le cas
// nominal où l'envoi est réellement tenté avec les bonnes infos.

// Mock minimal de Prisma.Decimal — seules les méthodes réellement appelées
// par le service (toNumber/lte/negated). `negated` retourne un `dec` lui-même
// pour rester chaînable si jamais un test l'inspecte plus loin.
const dec = (n: number) => ({
  toNumber: () => n,
  lte: (x: number) => n <= x,
  negated: () => dec(-n),
});
const HIER = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function factureRow(opts: {
  echeanceLe: string | null;
  clientEmail: string | null;
}) {
  return {
    id: 'F1',
    societeId: 'S1',
    numero: 1,
    statut: 'emise' as const,
    estAvoir: false,
    montantHt: dec(100000),
    tauxTva: dec(18),
    echeanceLe: opts.echeanceLe,
    emiseLe: new Date(),
    paiements: [],
    projet: { client: { id: 'C1', nom: 'Client X', email: opts.clientEmail } },
    devisOrigine: null,
    societe: { nom: 'Grey Concrete' },
  };
}

function setup(row: ReturnType<typeof factureRow> | null) {
  const findFirst = jest.fn().mockResolvedValue(row);
  const prisma = { facture: { findFirst } } as unknown as PrismaService;
  const envoyerRelanceFacture = jest.fn().mockResolvedValue({ envoye: true });
  const email = { envoyerRelanceFacture } as unknown as EmailService;
  const service = new FacturationService(prisma, email, { partsFactures: jest.fn().mockResolvedValue({ F1: 40, F2: 40, F3: 20 }) } as unknown as ReglagesService, OUVERTURE, NOTIFS, SEUIL_CEO);
  return { service, envoyerRelanceFacture, findFirst };
}

describe('FacturationService.relancer', () => {
  it('facture introuvable dans SA société → 404', async () => {
    const { service } = setup(null);
    await expect(service.relancer('S1', 'F1')).rejects.toThrow(NotFoundException);
  });

  it('HORS PÉRIMÈTRE : facture pas en retard (échéance future) → 409, aucun email tenté', async () => {
    const { service, envoyerRelanceFacture } = setup(
      factureRow({ echeanceLe: DEMAIN, clientEmail: 'client@exemple.sn' }),
    );
    await expect(service.relancer('S1', 'F1')).rejects.toThrow(ConflictException);
    expect(envoyerRelanceFacture).not.toHaveBeenCalled();
  });

  it('client sans email → 422 (donnée manquante, pas un échec de transport)', async () => {
    const { service, envoyerRelanceFacture } = setup(
      factureRow({ echeanceLe: HIER, clientEmail: null }),
    );
    await expect(service.relancer('S1', 'F1')).rejects.toThrow(UnprocessableEntityException);
    expect(envoyerRelanceFacture).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : facture en retard + client avec email → relance envoyée avec les bonnes infos', async () => {
    const { service, envoyerRelanceFacture } = setup(
      factureRow({ echeanceLe: HIER, clientEmail: 'client@exemple.sn' }),
    );
    const res = await service.relancer('S1', 'F1');
    expect(res.envoye).toBe(true);
    expect(envoyerRelanceFacture).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'client@exemple.sn',
        clientNom: 'Client X',
        societeNom: 'Grey Concrete',
        echeanceLe: HIER,
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// Vague B — extension de la couverture service-level (facturation en premier :
// c'est le module où une régression coûte le plus cher réellement — montants,
// numérotation légale, correction par avoir). Les fonctions pures qui portent
// le calcul (ventilationTva, statutFactureEffectif, joursRetardFacture) sont
// déjà couvertes dans gardes.spec.ts ; ce qui suit teste l'ORCHESTRATION que
// ces specs-là ne voient pas : gardes métier, transactions, séquencement.

const PROJET_MANDAT = { id: 'P1', nature: 'mandat_client', categorie: 'conception' };
const PROJET_VENTE = { id: 'P1', nature: 'promotion_interne', categorie: 'conception' };

function mockPrisma() {
  const facture = {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(({ data }) => ({ id: 'NEW', ...data })),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { numero: 0 } }),
  };
  const paiement = { create: jest.fn(), deleteMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() };
  const paiementSupprime = { create: jest.fn() };
  const projet = {
    findFirst: jest.fn().mockResolvedValue(PROJET_MANDAT),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ phase: 'avant_projet' }),
  };
  const versionPreBilan = { findMany: jest.fn().mockResolvedValue([]) };
  // Lignes SU / EX d'offre (facturation mensuelle, étape H2) : aucune par défaut.
  const ligneDevis = { findMany: jest.fn().mockResolvedValue([]) };
  // Études (refacturation, étape H3) : aucune par défaut.
  const blocEtude = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const ligneFacture = { count: jest.fn().mockResolvedValue(0) };
  const tx = { facture, paiement };
  const prisma = {
    facture,
    paiement,
    projet,
    versionPreBilan,
    ligneDevis,
    blocEtude,
    ligneFacture,
    paiementSupprime,
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(tx),
    ),
  } as unknown as PrismaService;
  return { prisma, facture, paiement, paiementSupprime, projet, versionPreBilan, ligneDevis, blocEtude, ligneFacture };
}

function service(prisma: PrismaService) {
  const email = {} as unknown as EmailService;
  return new FacturationService(prisma, email, { partsFactures: jest.fn().mockResolvedValue({ F1: 40, F2: 40, F3: 20 }) } as unknown as ReglagesService, OUVERTURE, NOTIFS, SEUIL_CEO);
}

describe('FacturationService.creerEcheancier', () => {
  it('HORS PÉRIMÈTRE : projet promotion_interne → 422, aucune ligne créée', async () => {
    const { prisma, facture, projet } = mockPrisma();
    projet.findFirst.mockResolvedValue(PROJET_VENTE);
    const svc = service(prisma);
    await expect(
      svc.creerEcheancier('S1', 'P1', {
        montants: { signature: 100, avant_projet: 100, livraison: 100 },
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(facture.createMany).not.toHaveBeenCalled();
  });

  it('un échéancier existe déjà pour ce projet → 409', async () => {
    const { prisma, facture } = mockPrisma();
    facture.count.mockResolvedValue(3);
    const svc = service(prisma);
    await expect(
      svc.creerEcheancier('S1', 'P1', {
        montants: { signature: 100, avant_projet: 100, livraison: 100 },
      }),
    ).rejects.toThrow(ConflictException);
    expect(facture.createMany).not.toHaveBeenCalled();
  });

  it('AUTORISÉ : mandat client sans échéancier existant → 3 jalons créés avec le bon montant chacun', async () => {
    const { prisma, facture } = mockPrisma();
    const svc = service(prisma);
    await svc.creerEcheancier('S1', 'P1', {
      montants: { signature: 1000, avant_projet: 2000, livraison: 3000 },
      tauxTva: 10,
    });
    expect(facture.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ jalon: 'signature', montantHt: 1000, tauxTva: 10 }),
        expect.objectContaining({ jalon: 'avant_projet', montantHt: 2000, tauxTva: 10 }),
        expect.objectContaining({ jalon: 'livraison', montantHt: 3000, tauxTva: 10 }),
      ],
    });
  });
});

describe('FacturationService.emettre', () => {
  it('montant HT à zéro → 422, jamais de numéro consommé', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'brouillon', montantHt: dec(0) });
    const svc = service(prisma);
    await expect(svc.emettre('S1', 'P1', 'F1', 'U1')).rejects.toThrow(UnprocessableEntityException);
    expect(facture.updateMany).not.toHaveBeenCalled();
  });

  it('facture déjà émise entre-temps (course concurrente) → 409', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'brouillon', montantHt: dec(1000) });
    facture.updateMany.mockResolvedValue({ count: 0 }); // 2ᵉ émission : plus rien à jour
    const svc = service(prisma);
    await expect(svc.emettre('S1', 'P1', 'F1', 'U1')).rejects.toThrow(ConflictException);
  });

  it('AUTORISÉ : numéro = max existant + 1, conditionné sur statut=brouillon', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'brouillon', montantHt: dec(1000) });
    facture.aggregate.mockResolvedValue({ _max: { numero: 7 } });
    const svc = service(prisma);
    await svc.emettre('S1', 'P1', 'F1', 'U1');
    expect(facture.updateMany).toHaveBeenCalledWith({
      where: { id: 'F1', statut: 'brouillon' },
      data: expect.objectContaining({ numero: 8, statut: 'emise', emiseParId: 'U1' }),
    });
  });
});

describe('FacturationService.creerAvoir', () => {
  it('facture introuvable dans SA société → 404', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(svc.creerAvoir('S1', 'P1', 'F1', 'U1')).rejects.toThrow(NotFoundException);
  });

  it('HORS PÉRIMÈTRE : un avoir ne s’annule pas par un autre avoir → 409', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'emise', estAvoir: true });
    const svc = service(prisma);
    await expect(svc.creerAvoir('S1', 'P1', 'F1', 'U1')).rejects.toThrow(ConflictException);
  });

  it('facture pas encore émise (brouillon) → 409, rien à corriger', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'brouillon', estAvoir: false });
    const svc = service(prisma);
    await expect(svc.creerAvoir('S1', 'P1', 'F1', 'U1')).rejects.toThrow(ConflictException);
  });

  it('AUTORISÉ : avoir créé avec le montant NÉGATIF, lié à la facture d’origine', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({
      id: 'F1',
      statut: 'emise',
      estAvoir: false,
      numero: 12,
      emiseLe: new Date('2026-03-01'),
      type: 'honoraires',
      jalon: null,
      montantHt: dec(500000),
      tauxTva: dec(18),
    });
    const svc = service(prisma);
    await svc.creerAvoir('S1', 'P1', 'F1', 'U1');

    // L'originale bascule en annulée, conditionnée sur son statut actuel —
    // exclut une course où elle aurait déjà un avoir.
    expect(facture.updateMany).toHaveBeenCalledWith({
      where: { id: 'F1', statut: 'emise', estAvoir: false },
      data: expect.objectContaining({ statut: 'annulee' }),
    });
    // Le nouvel avoir porte le montant en négatif et pointe vers l'originale.
    // (comparé via .toNumber() plutôt qu'une égalité profonde : le mock
    // Decimal génère un nouvel objet à chaque .negated(), jamais égal par
    // référence à celui construit dans l'assertion.)
    const creation = facture.create.mock.calls[0][0].data;
    expect(creation.estAvoir).toBe(true);
    expect(creation.factureOrigineId).toBe('F1');
    expect(creation.montantHt.toNumber()).toBe(-500000);
    expect(creation.libelle).toContain('Avoir sur');
  });

  it('course concurrente : deux avoirs sur la même facture → le 2ᵉ voit 409', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({
      id: 'F1',
      statut: 'emise',
      estAvoir: false,
      numero: 12,
      emiseLe: new Date(),
      type: 'honoraires',
      jalon: null,
      montantHt: dec(500000),
      tauxTva: dec(18),
    });
    facture.updateMany.mockResolvedValue({ count: 0 }); // déjà annulée par le 1er avoir
    const svc = service(prisma);
    await expect(svc.creerAvoir('S1', 'P1', 'F1', 'U1')).rejects.toThrow(ConflictException);
    expect(facture.create).not.toHaveBeenCalled();
  });
});

describe('FacturationService.ajouterPaiement', () => {
  const PAIEMENT = { date: '2026-03-10', montant: 100_000 };

  it('facture introuvable → 404', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue(null);
    const svc = service(prisma);
    await expect(svc.ajouterPaiement('S1', 'P1', 'F1', PAIEMENT, 'U1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('HORS PÉRIMÈTRE : un avoir ne reçoit pas de paiement → 409', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'emise', estAvoir: true });
    const svc = service(prisma);
    await expect(svc.ajouterPaiement('S1', 'P1', 'F1', PAIEMENT, 'U1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('facture encore brouillon → 409, pas de paiement possible avant émission', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'brouillon', estAvoir: false });
    const svc = service(prisma);
    await expect(svc.ajouterPaiement('S1', 'P1', 'F1', PAIEMENT, 'U1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('AUTORISÉ : facture émise → paiement enregistré avec les bons montants', async () => {
    const { prisma, facture, paiement } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1', statut: 'emise', estAvoir: false });
    const svc = service(prisma);
    await svc.ajouterPaiement('S1', 'P1', 'F1', { ...PAIEMENT, reference: 'CHQ-1' }, 'U1');
    expect(paiement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        factureId: 'F1',
        montant: 100_000,
        reference: 'CHQ-1',
        creeParId: 'U1',
      }),
    });
  });

  it('suppression tracée : copie dans PaiementSupprime (auteur + supprimeur) puis delete', async () => {
    const { prisma, facture, paiement, paiementSupprime } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1' });
    const creeLe = new Date('2026-10-01');
    paiement.findFirst.mockResolvedValue({
      id: 'PA1', factureId: 'F1', date: '2026-10-01', montant: 50_000, mode: 'virement',
      reference: 'VIR-9', creeLe, creeParId: 'U7',
    });
    await service(prisma).supprimerPaiement('S1', 'P1', 'F1', 'PA1', 'U1');
    expect(paiementSupprime.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paiementId: 'PA1', factureId: 'F1', societeId: 'S1', montant: 50_000, creeLe, creeParId: 'U7', supprimeParId: 'U1',
      }),
    });
    expect(paiement.delete).toHaveBeenCalledWith({ where: { id: 'PA1' } });
  });

  it('suppression d’un paiement inexistant : rien n’est tracé', async () => {
    const { prisma, facture, paiement, paiementSupprime } = mockPrisma();
    facture.findFirst.mockResolvedValue({ id: 'F1' });
    paiement.findFirst.mockResolvedValue(null);
    await service(prisma).supprimerPaiement('S1', 'P1', 'F1', 'PA1', 'U1');
    expect(paiementSupprime.create).not.toHaveBeenCalled();
  });
});

describe('FacturationService.get (résumé calculé par formater())', () => {
  it('totalFactureTtc exclut les brouillons ; un avoir compense sa facture (les deux TTC s’annulent)', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findMany.mockResolvedValue([
      {
        id: 'F1',
        numero: 1,
        statut: 'emise',
        estAvoir: false,
        montantHt: dec(100_000),
        tauxTva: dec(18),
        echeanceLe: null,
        emiseLe: new Date('2026-01-01'),
        creeLe: new Date('2026-01-01'),
        annuleeLe: new Date('2026-02-01'),
        factureOrigineId: null,
        paiements: [],
        lignes: [],
      },
      {
        id: 'AV1',
        numero: 2,
        statut: 'emise',
        estAvoir: true,
        montantHt: dec(-100_000),
        tauxTva: dec(18),
        echeanceLe: null,
        emiseLe: new Date('2026-02-01'),
        creeLe: new Date('2026-02-01'),
        annuleeLe: null,
        factureOrigineId: 'F1',
        paiements: [],
        lignes: [],
      },
      {
        id: 'BR1',
        numero: null,
        statut: 'brouillon',
        estAvoir: false,
        montantHt: dec(999_999), // ne doit compter nulle part dans le résumé
        tauxTva: dec(18),
        echeanceLe: null,
        emiseLe: null,
        creeLe: new Date('2026-03-01'),
        annuleeLe: null,
        factureOrigineId: null,
        paiements: [],
        lignes: [],
      },
    ]);
    const svc = service(prisma);
    const res = await svc.get('S1', 'P1');
    expect(res.resume.totalFactureTtc).toBe(0); // 118 000 + (−118 000)
    expect(res.factures).toHaveLength(3);
  });

  it('suggestionVenteHt = prix de vente de la DERNIÈRE version de pré-bilan figée', async () => {
    const { prisma, versionPreBilan } = mockPrisma();
    versionPreBilan.findMany.mockResolvedValue([
      { figeeLe: new Date('2026-01-01'), prixVenteEstime: dec(10_000_000) },
      { figeeLe: new Date('2026-06-01'), prixVenteEstime: dec(12_000_000) },
      { figeeLe: null, prixVenteEstime: dec(99_000_000) }, // pas figée -> ignorée
    ]);
    const svc = service(prisma);
    const res = await svc.get('S1', 'P1');
    expect(res.resume.suggestionVenteHt).toBe(12_000_000);
  });
});

describe('FacturationService.findAllPourSociete', () => {
  it('résout le client via devisOrigine quand la facture n’a pas de projet (devis libre)', async () => {
    const { prisma, facture } = mockPrisma();
    facture.findMany.mockResolvedValue([
      {
        id: 'F1',
        numero: 1,
        statut: 'emise',
        estAvoir: false,
        montantHt: dec(100_000),
        tauxTva: dec(18),
        echeanceLe: null,
        emiseLe: new Date(),
        creeLe: new Date(),
        annuleeLe: null,
        factureOrigineId: null,
        devisOrigineId: 'D1',
        projetId: null,
        projet: null,
        devisOrigine: { numero: 3, client: { id: 'C1', nom: 'Client Libre' } },
        paiements: [],
        lignes: [],
      },
    ]);
    (facture as unknown as { groupBy: jest.Mock }).groupBy = jest.fn().mockResolvedValue([]);
    const svc = service(prisma);
    const res = await svc.findAllPourSociete('S1', {});
    expect(res[0].client).toEqual({ id: 'C1', nom: 'Client Libre' });
    expect(res[0].projet).toBeNull();
    // Sans dossier : référence de la séquence de la société.
    expect(res[0].reference).toMatch(/^F\d{4}-0001$/);
  });
});

describe('refFacture · numérotation par dossier (maquette Finances)', () => {
  it('code du dossier + rang ; sans dossier, séquence de la société', () => {
    const { refFacture } = jest.requireActual('../domaine/config');
    expect(refFacture({ numero: 42, emiseLe: '2026-09-23', estAvoir: false, codeDossier: 'D_ALM.26', rangDossier: 1 })).toBe('D_ALM.26-1');
    expect(refFacture({ numero: 7, emiseLe: '2026-09-23', estAvoir: false, codeDossier: null, rangDossier: null })).toBe('F2026-0007');
    expect(refFacture({ numero: null, emiseLe: null, estAvoir: false, codeDossier: null, rangDossier: null })).toBeNull();
  });
});

// Facturation mensuelle manuelle (SU / EX de l'offre acceptée, étape H2).
describe('FacturationService.creerMensualite', () => {
  const ceMois = new Date();
  const moisDernier = new Date(ceMois.getFullYear(), ceMois.getMonth() - 1, 15);
  const ligneSu = (mensualites: { statut: string; estAvoir: boolean; creeLe: Date }[]) => ({
    id: 'L-SU',
    designation: 'SU2 — Suivi de chantier — projet intermédiaire',
    quantite: dec(6),
    prixUnitaire: dec(500000),
    tauxTva: dec(18),
    produitService: { code: 'SU2' },
    mensualites,
  });
  const facturee = (creeLe: Date, statut = 'emise') => ({ statut, estAvoir: false, creeLe });

  function monter(phase: string, mensualites: ReturnType<typeof facturee>[]) {
    const m = mockPrisma();
    m.projet.findFirst.mockResolvedValue({ ...PROJET_MANDAT, phase });
    m.projet.findUniqueOrThrow.mockResolvedValue({ phase });
    m.ligneDevis.findMany.mockResolvedValue([ligneSu(mensualites)]);
    return { ...m, svc: service(m.prisma) };
  }

  it('crée la mensualité suivante au prix mensuel du catalogue, en brouillon', async () => {
    const { svc, facture } = monter('chantier', [facturee(moisDernier)]);
    await svc.creerMensualite('S1', 'P1', 'L-SU');
    expect(facture.create.mock.calls[0][0].data).toMatchObject({
      montantHt: 500000,
      tauxTva: 18,
      ligneDevisId: 'L-SU',
    });
    expect(facture.create.mock.calls[0][0].data.libelle).toMatch(/^SU2 — .* mensualité 2\/6 /);
  });

  it('déjà facturée ce mois-ci → 409', async () => {
    const { svc } = monter('chantier', [facturee(ceMois)]);
    await expect(svc.creerMensualite('S1', 'P1', 'L-SU')).rejects.toThrow(ConflictException);
  });

  it('toutes les mensualités prévues facturées → 409 (une annulée ne compte pas)', async () => {
    const six = Array.from({ length: 6 }, (_, i) => facturee(new Date(2025, i, 10)));
    await expect(monter('chantier', six).svc.creerMensualite('S1', 'P1', 'L-SU')).rejects.toThrow(
      'déjà facturées',
    );
    const avecAnnulee = [...six.slice(0, 5), facturee(new Date(2025, 5, 10), 'annulee')];
    await expect(
      monter('chantier', avecAnnulee).svc.creerMensualite('S1', 'P1', 'L-SU'),
    ).resolves.toBeDefined();
  });

  it('rappel « à facturer ce mois » : seulement en chantier et sans mensualité ce mois-ci', async () => {
    const enChantier = await monter('chantier', [facturee(moisDernier)]).svc.get('S1', 'P1');
    expect(enChantier.mensualites[0]).toMatchObject({ moisPrevus: 6, moisFactures: 1, aFacturerCeMois: true });
    const avantChantier = await monter('permis', []).svc.get('S1', 'P1');
    expect(avantChantier.mensualites[0].aFacturerCeMois).toBe(false);
  });
});

// Refacturation des études techniques (étape H3, option B, CGV art. 5).
describe('FacturationService — refacturation des études', () => {
  const bloc = (o: Record<string, unknown> = {}) => ({
    id: 'B1',
    libelle: 'Étude de sol',
    interlocuteur: 'Géotech SARL',
    factureMontant: dec(1_000_000),
    bureauRegleLe: null,
    lignesFacture: [],
    ...o,
  });

  it('une facture, une ligne par étude, bureau × 1,10, TVA unique 18 %', async () => {
    const m = mockPrisma();
    m.blocEtude.findMany.mockResolvedValueOnce([
      bloc(),
      bloc({ id: 'B2', libelle: 'Étude béton armé', interlocuteur: 'Structura', factureMontant: dec(500_000) }),
    ]);
    await service(m.prisma).refacturerEtudes('S1', 'P1', ['B1', 'B2']);
    const data = m.facture.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ montantHt: 1_650_000, tauxTva: 18 });
    expect(data.lignes.create).toEqual([
      { designation: 'Étude de sol — Géotech SARL', montantBase: 1_000_000, montantHt: 1_100_000, blocEtudeId: 'B1', ordre: 0 },
      { designation: 'Étude béton armé — Structura', montantBase: 500_000, montantHt: 550_000, blocEtudeId: 'B2', ordre: 1 },
    ]);
  });

  it('étude sans bureau ou sans montant → 422 ; déjà refacturée (facture active) → 409', async () => {
    const m = mockPrisma();
    m.blocEtude.findMany.mockResolvedValueOnce([bloc({ interlocuteur: ' ' })]);
    await expect(service(m.prisma).refacturerEtudes('S1', 'P1', ['B1'])).rejects.toThrow(
      UnprocessableEntityException,
    );
    const m2 = mockPrisma();
    m2.blocEtude.findMany.mockResolvedValueOnce([
      bloc({ lignesFacture: [{ facture: { statut: 'emise', estAvoir: false } }] }),
    ]);
    await expect(service(m2.prisma).refacturerEtudes('S1', 'P1', ['B1'])).rejects.toThrow(
      ConflictException,
    );
  });

  it('refacturation annulée par avoir → l’étude redevient refacturable', async () => {
    const m = mockPrisma();
    m.blocEtude.findMany.mockResolvedValueOnce([
      bloc({ lignesFacture: [{ facture: { statut: 'annulee', estAvoir: false } }] }),
    ]);
    await expect(service(m.prisma).refacturerEtudes('S1', 'P1', ['B1'])).resolves.toBeDefined();
  });

  it('montant d’une facture à lignes non modifiable à la main', async () => {
    const m = mockPrisma();
    m.facture.findFirst.mockResolvedValue({ id: 'F1', projetId: 'P1', statut: 'brouillon' });
    m.ligneFacture.count.mockResolvedValue(2);
    await expect(
      service(m.prisma).patch('S1', 'P1', 'F1', { montantHt: 1 }),
    ).rejects.toThrow('somme de ses lignes');
  });

  it('régler le bureau avant l’encaissement complet du client → 409', async () => {
    const m = mockPrisma();
    m.blocEtude.findFirst.mockResolvedValue({ id: 'B1', bureauRegleLe: null });
    // Facture de refacturation émise, rien payé → en attente d'encaissement.
    m.facture.findMany.mockResolvedValue([
      { id: 'F9', numero: 3, statut: 'emise', estAvoir: false, montantHt: dec(1_100_000), tauxTva: dec(18), echeanceLe: null, emiseLe: new Date(), creeLe: new Date(), paiements: [], lignes: [] },
    ]);
    m.blocEtude.findMany.mockResolvedValue([
      { ...bloc(), lignesFacture: [{ factureId: 'F9', montantHt: dec(1_100_000) }] },
    ]);
    await expect(
      service(m.prisma).marquerBureauRegle('S1', 'P1', 'B1', 'U-CFO'),
    ).rejects.toThrow('après l’encaissement complet');
    expect(m.blocEtude.update).not.toHaveBeenCalled();
  });

  it('client soldé → bureau « à régler », puis réglé par la CFO', async () => {
    const m = mockPrisma();
    m.blocEtude.findFirst.mockResolvedValue({ id: 'B1', bureauRegleLe: null });
    m.facture.findMany.mockResolvedValue([
      {
        id: 'F9', numero: 3, statut: 'emise', estAvoir: false, montantHt: dec(1_100_000), tauxTva: dec(18),
        echeanceLe: null, emiseLe: new Date(), creeLe: new Date(), lignes: [],
        paiements: [{ id: 'PA', date: '2026-09-27', montant: dec(1_298_000), mode: 'wave', reference: '', creeLe: new Date() }],
      },
    ]);
    m.blocEtude.findMany.mockResolvedValue([
      { ...bloc(), lignesFacture: [{ factureId: 'F9', montantHt: dec(1_100_000) }] },
    ]);
    const avant = await service(m.prisma).get('S1', 'P1');
    expect(avant.etudes[0].statutReglement).toBe('a_regler');
    await service(m.prisma).marquerBureauRegle('S1', 'P1', 'B1', 'U-CFO');
    expect(m.blocEtude.update.mock.calls[0][0].data).toMatchObject({ bureauRegleParId: 'U-CFO' });
  });
});

describe('FacturationService · parts F1 / F2 / F3 (Réglages)', () => {
  const reglages = { partsFactures: jest.fn().mockResolvedValue({ F1: 30, F2: 50, F3: 20 }) } as unknown as ReglagesService;
  const service = new FacturationService({} as PrismaService, {} as never, reglages, OUVERTURE, NOTIFS, SEUIL_CEO);
  it('soumission à la DAF : fige le réglage en service sur les offres brouillon pas encore figées', async () => {
    const tx = { devis: { updateMany: jest.fn() } };
    await service.figerPartsOffres(tx as never, 'S1', 'D1');
    expect(tx.devis.updateMany).toHaveBeenCalledWith({
      where: { dossierCrmId: 'D1', statut: 'brouillon', partsFactures: { equals: expect.anything() } },
      data: { partsFactures: { F1: 30, F2: 50, F3: 20 } },
    });
  });
  it('Onboard : les parts figées de l’offre priment sur le réglage courant', async () => {
    const tx = {
      ligneDevis: { findMany: jest.fn().mockResolvedValue([{ designation: 'CO2', quantite: { toNumber: () => 1 }, prixUnitaire: { toNumber: () => 1_000_000 }, tauxTva: { toNumber: () => 18 }, produitService: { code: 'CO2', famille: 'CO' } }]) },
      devis: { findUnique: jest.fn().mockResolvedValue({ partsFactures: { F1: 40, F2: 40, F3: 20 } }) },
      facture: { createMany: jest.fn() },
    };
    await service.preparerDepuisOffre(tx as never, 'S1', { id: 'P1', nature: 'mandat_client' as never }, 'DV1');
    const { data } = tx.facture.createMany.mock.calls[0][0];
    expect(data.map((f: { montantHt: number }) => f.montantHt)).toEqual([400_000, 400_000, 200_000]);
    expect(reglages.partsFactures).not.toHaveBeenCalled();
  });
});
