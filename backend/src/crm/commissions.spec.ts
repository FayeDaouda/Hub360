import { commissionsAttendues, modeA, partHt } from './commissions';
import { CommissionsService } from './commissions.service';

// Commissions des apporteurs (revue COO, 22/10/2026).
describe('règles de commission', () => {
  const dossier = { id: 'D1', taux: 4, signeLe: '2026-06-30', signeHt: 21_000_000 };
  const encaissement = (paiementId: string, montantTtc: number, date = '2026-07-15') => ({
    paiementId,
    date,
    montantTtc,
    factureHt: 8_400_000,
    factureTtc: 9_912_000,
  });

  it('par défaut : % des honoraires HT encaissés, une ligne par encaissement, au prorata', () => {
    expect(partHt(encaissement('P1', 4_956_000))).toBe(4_200_000); // la moitié de la facture
    expect(
      commissionsAttendues(dossier, 'encaisse_prorata', [
        encaissement('P1', 9_912_000),
        encaissement('P2', 4_956_000, '2026-09-01'),
      ]),
    ).toEqual([
      { cle: 'paiement:P1', paiementId: 'P1', baseHt: 8_400_000, montant: 336_000, exigibleLe: '2026-07-15' },
      { cle: 'paiement:P2', paiementId: 'P2', baseHt: 4_200_000, montant: 168_000, exigibleLe: '2026-09-01' },
    ]);
  });

  it('autre mode : % du contrat signé, due à la signature', () => {
    expect(commissionsAttendues(dossier, 'signature_contrat', [encaissement('P1', 9_912_000)])).toEqual([
      { cle: 'signature:D1', paiementId: null, baseHt: 21_000_000, montant: 840_000, exigibleLe: '2026-06-30' },
    ]);
    expect(commissionsAttendues({ ...dossier, signeHt: null }, 'signature_contrat', [])).toEqual([]);
  });

  it('mode en vigueur à la signature ; avant tout réglage, le mode par défaut', () => {
    const versions = [
      { modeCommission: 'encaisse_prorata' as const, jour: '2026-03-01' },
      { modeCommission: 'signature_contrat' as const, jour: '2026-08-01' },
    ];
    expect(modeA(versions, '2026-06-30')).toBe('encaisse_prorata');
    expect(modeA(versions, '2026-09-10')).toBe('signature_contrat');
    expect(modeA([{ modeCommission: 'signature_contrat', jour: '2026-08-01' }], '2026-06-30')).toBe('encaisse_prorata');
  });
});

describe('CommissionsService', () => {
  const dec = (n: number) => ({ toNumber: () => n });
  function svc(o: { existantes?: unknown[]; role?: string } = {}) {
    const prisma = {
      dossierCrm: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'D1',
            code: 'NF_ALM.26',
            commissionApporteur: dec(4),
            apporteurType: 'externe',
            apporteurNom: 'Me Aliou Ndiaye',
            apporteurUtilisateur: null,
            transitions: [{ creeLe: new Date('2026-06-30T10:00:00Z') }],
            offres: [],
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'D1',
          code: 'NF_ALM.26',
          apporteurType: 'externe',
          apporteurNom: 'Me Aliou Ndiaye',
          apporteurUtilisateur: null,
        }),
      },
      paiement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'P1',
            date: '2026-07-15',
            montant: dec(9_912_000),
            facture: {
              montantHt: dec(8_400_000),
              tauxTva: dec(18),
              dossierCrmId: null,
              projet: { dossierCrmId: 'D1' },
            },
          },
        ]),
      },
      profilFacturation: { findMany: jest.fn().mockResolvedValue([]) },
      commissionApporteur: {
        findMany: jest.fn().mockResolvedValue(o.existantes ?? []),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      coordonneesApporteur: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notifications = {
      titulairesRole: jest.fn((_s: string, r: string) => Promise.resolve([r])),
      envoyer: jest.fn(),
    };
    const confirmation = {
      verifier: jest.fn().mockResolvedValue('mot_de_passe'),
      mode: jest.fn().mockResolvedValue('mot_de_passe'),
    };
    return {
      s: new CommissionsService(prisma as never, notifications as never, confirmation as never),
      prisma,
      notifications,
      confirmation,
    };
  }

  it('encaissement d’honoraires → ligne à payer créée, CFO prévenu ; rejouée → rien de plus', async () => {
    const { s, prisma, notifications } = svc();
    await s.synchroniser('S1');
    expect(prisma.commissionApporteur.create).toHaveBeenCalledWith({
      data: {
        societeId: 'S1',
        dossierCrmId: 'D1',
        cle: 'paiement:P1',
        paiementId: 'P1',
        baseHt: 8_400_000,
        taux: 4,
        montant: 336_000,
        exigibleLe: '2026-07-15',
      },
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commission_a_payer',
        destinataireIds: ['CFO'],
        titre: expect.stringContaining('336'),
      }),
    );
    const rejeu = svc({
      existantes: [
        {
          id: 'C1',
          cle: 'paiement:P1',
          statut: 'a_payer',
          montant: dec(336_000),
          taux: dec(4),
          exigibleLe: '2026-07-15',
        },
      ],
    });
    await rejeu.s.synchroniser('S1');
    expect(rejeu.prisma.commissionApporteur.create).not.toHaveBeenCalled();
    expect(rejeu.notifications.envoyer).not.toHaveBeenCalled();
  });

  it('encaissement supprimé : la ligne à payer disparaît, la ligne payée reste', async () => {
    const { s, prisma } = svc({
      existantes: [
        {
          id: 'C1',
          cle: 'paiement:P1',
          statut: 'a_payer',
          montant: dec(336_000),
          taux: dec(4),
          exigibleLe: '2026-07-15',
        },
        { id: 'C2', cle: 'paiement:PX', statut: 'a_payer', montant: dec(1), taux: dec(4), exigibleLe: '2026-07-01' },
        { id: 'C3', cle: 'paiement:PY', statut: 'payee', montant: dec(1), taux: dec(4), exigibleLe: '2026-07-01' },
      ],
    });
    await s.synchroniser('S1');
    expect(prisma.commissionApporteur.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['C2'] } } });
  });

  it('payer demande la Validation des commissions (le CFO au départ) ; le COO est prévenu', async () => {
    const coo = { userId: 'U', societeId: 'S1', role: 'COO', permissions: { 'finances.commissions': 'LE' } };
    await expect(svc().s.payer(coo, 'C1', { date: '2026-10-01', mode: 'virement' })).rejects.toThrow('Validation');
    const { s, prisma, notifications } = svc();
    prisma.commissionApporteur.findFirst.mockResolvedValue({
      id: 'C1',
      dossierCrmId: 'D1',
      statut: 'a_payer',
      montant: dec(336_000),
      dossier: {
        code: 'NF_ALM.26',
        apporteurType: 'externe',
        apporteurNom: 'Me Aliou Ndiaye',
        apporteurUtilisateur: null,
      },
    });
    await s.payer(
      { userId: 'CFO1', societeId: 'S1', role: 'CFO', permissions: { 'finances.commissions': 'LV' } },
      'C1',
      {
        date: '2026-10-01',
        mode: 'virement',
        reference: 'VIR-12',
      },
    );
    expect(prisma.commissionApporteur.updateMany).toHaveBeenCalledWith({
      where: { id: 'C1', statut: 'a_payer' },
      data: {
        statut: 'payee',
        payeeLe: '2026-10-01',
        payeeParId: 'CFO1',
        modePaiement: 'virement',
        reference: 'VIR-12',
      },
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'commission_payee', destinataireIds: ['COO'] }),
    );
  });

  it('coordonnées : l’Écriture des commissions (le COO au départ), identité confirmée, CFO et CEO prévenus sans les numéros', async () => {
    await expect(
      svc().s.modifierCoordonnees(
        { userId: 'C', societeId: 'S1', role: 'CFO', permissions: { 'finances.commissions': 'LV' } },
        'D1',
        { rib: 'SN01' },
      ),
    ).rejects.toThrow('Écriture');
    const { s, prisma, notifications, confirmation } = svc();
    await s.modifierCoordonnees(
      { userId: 'COO1', societeId: 'S1', role: 'COO', permissions: { 'finances.commissions': 'LE' } },
      'D1',
      {
        wave: '77 000 00 00',
        confirmation: 'secret',
      },
    );
    expect(confirmation.verifier).toHaveBeenCalledWith('COO1', 'secret');
    expect(prisma.coordonneesApporteur.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dossierCrmId: 'D1', wave: '77 000 00 00', confirmation: 'mot_de_passe' }),
    });
    const notif = notifications.envoyer.mock.calls[0][0];
    expect(notif).toMatchObject({
      type: 'coordonnees_apporteur_modifiees',
      destinataireIds: ['CFO', 'CEO (transverse)'],
    });
    expect(notif.titre).toContain('Wave');
    expect(notif.titre).not.toContain('77 000');
  });
});
