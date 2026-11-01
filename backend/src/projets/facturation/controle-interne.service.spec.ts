import { Prisma } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { ControleInterneService } from './controle-interne.service';
import { FacturationService } from './facturation.service';

const dec = (n: number) => new Prisma.Decimal(n);
const CFO = { userId: 'U-CFO', role: 'CFO' };
const CEO = { userId: 'U-CEO', role: 'CEO (transverse)', permissions: { 'finances.contresignature': 'V' } };

function svc(
  o: {
    montantHt?: number;
    enAttente?: number;
    demande?: Record<string, unknown>;
    clotures?: { mois: string; action: string }[];
  } = {},
) {
  const prisma = {
    facture: {
      findFirst: jest.fn((args: { where: { factureOrigineId?: string } }) =>
        Promise.resolve(
          args.where.factureOrigineId
            ? { id: 'AV1' }
            : {
                id: 'F1',
                numero: 3,
                emiseLe: new Date('2026-09-10'),
                estAvoir: false,
                statut: 'emise',
                montantHt: dec(o.montantHt ?? 500_000),
                tauxTva: dec(18),
                projet: { code: 'TC_ALM.26' },
              },
        ),
      ),
    },
    delegationCeo: { findFirst: jest.fn().mockResolvedValue(null) }, // aucune délégation du CEO en cours
    demandeAvoir: {
      count: jest.fn().mockResolvedValue(o.enAttente ?? 0),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'D1', ...data })),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'D1',
        factureId: 'F1',
        statut: 'a_valider',
        demandeParId: CFO.userId,
        facture: { id: 'F1', numero: 3, emiseLe: new Date('2026-09-10'), estAvoir: false, projetId: 'P1' },
        ...o.demande,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    journalCloture: { findMany: jest.fn().mockResolvedValue(o.clotures ?? []), create: jest.fn() },
    utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const reglages = { regle: jest.fn().mockResolvedValue(1_000_000) } as unknown as ReglagesService;
  const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['U-CEO']) };
  const facturation = { creerAvoir: jest.fn() } as unknown as FacturationService;
  const s = new ControleInterneService(prisma, reglages, notifications as unknown as NotificationsService, facturation);
  // Clôtures : la liste des mois n'est pas sous test ici.
  jest.spyOn(s, 'clotures').mockResolvedValue([]);
  return { s, prisma, notifications, facturation };
}

const DEMANDE = { motif: 'erreur_facturation' as const, commentaire: 'Mauvais taux de TVA appliqué' };

describe('ControleInterneService · avoirs (revue CFO 20/10/2026)', () => {
  it('sous le seuil : avoir émis aussitôt, motif gardé, CEO prévenu', async () => {
    const { s, prisma, notifications, facturation } = svc({ montantHt: 500_000 }); // 590 000 TTC
    expect(await s.demanderAvoir('S1', 'P1', 'F1', DEMANDE, CFO)).toEqual({ emis: true, seuil: 1_000_000 });
    expect(prisma.demandeAvoir.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ statut: 'valide', motif: 'erreur_facturation' }),
    });
    expect(facturation.creerAvoir).toHaveBeenCalledWith('S1', 'P1', 'F1', CFO.userId);
    expect(prisma.demandeAvoir.update).toHaveBeenCalledWith({ where: { id: 'D1' }, data: { avoirId: 'AV1' } });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'avoir_emis', destinataireIds: ['U-CEO'] }),
    );
  });

  it('au-delà du seuil : en attente du CEO, facture intacte', async () => {
    const { s, prisma, notifications, facturation } = svc({ montantHt: 2_000_000 });
    expect((await s.demanderAvoir('S1', 'P1', 'F1', DEMANDE, CFO)).emis).toBe(false);
    expect(prisma.demandeAvoir.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ statut: 'valide' }),
    });
    expect(facturation.creerAvoir).not.toHaveBeenCalled();
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'avoir_a_valider' }));
    await expect(svc({ enAttente: 1 }).s.demanderAvoir('S1', 'P1', 'F1', DEMANDE, CFO)).rejects.toThrow(/attend déjà/);
    await expect(svc().s.demanderAvoir('S1', 'P1', 'F1', { ...DEMANDE, commentaire: 'x' }, CFO)).rejects.toThrow(
      /Précisez/,
    );
  });

  it('décision : la contresignature (le CEO au départ), jamais sur sa propre demande ; refus motivé', async () => {
    const { s, facturation } = svc();
    await s.deciderAvoir('S1', 'D1', CEO, true);
    expect(facturation.creerAvoir).toHaveBeenCalledWith('S1', 'P1', 'F1', CEO.userId);
    await expect(svc().s.deciderAvoir('S1', 'D1', CFO, true)).rejects.toThrow(/CEO/);
    await expect(svc({ demande: { demandeParId: CEO.userId } }).s.deciderAvoir('S1', 'D1', CEO, true)).rejects.toThrow(
      /propre demande/,
    );
    await expect(svc().s.deciderAvoir('S1', 'D1', CEO, false)).rejects.toThrow(/motif du refus/);
  });
});

describe('ControleInterneService · clôture mensuelle', () => {
  it('seul un mois terminé se clôture, une fois', async () => {
    const courant = new Date().toISOString().slice(0, 7);
    await expect(svc().s.cloturer('S1', courant, CFO)).rejects.toThrow(/terminé/);
    await expect(
      svc({ clotures: [{ mois: '2026-09', action: 'cloture' }] }).s.cloturer('S1', '2026-09', CFO),
    ).rejects.toThrow(/déjà/);
    const { s, prisma } = svc();
    await s.cloturer('S1', '2026-09', CFO);
    expect(prisma.journalCloture.create).toHaveBeenCalledWith({
      data: { societeId: 'S1', mois: '2026-09', action: 'cloture', parId: CFO.userId },
    });
  });

  // Qui rouvre : la Suppression de « Clôture du mois », vérifiée par la route.
  it('réouverture : avec un motif ; le CFO est prévenu', async () => {
    const clos = { clotures: [{ mois: '2026-09', action: 'cloture' }] };
    await expect(svc(clos).s.rouvrir('S1', '2026-09', CEO, 'x')).rejects.toThrow(/motif/);
    const { s, prisma, notifications } = svc(clos);
    await s.rouvrir('S1', '2026-09', CEO, 'Paiement du 30/09 mal daté');
    expect(prisma.journalCloture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'reouverture', motif: 'Paiement du 30/09 mal daté' }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(expect.objectContaining({ type: 'cloture_a_faire' }));
  });
});
