import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateEffetMin, refusProposition, salaireAu } from './regles-salaire';
import { SalairesService } from './salaires.service';

const valide = (montant: number, dateEffet: string | null, decideLe = '2026-01-01') => ({
  montant,
  dateEffet,
  statut: 'valide' as const,
  decideLe: new Date(decideLe),
});

describe('regles-salaire (historique, revue RH validée 20/10/2026)', () => {
  it('salaire en vigueur : dernier changement validé dont la date d’effet est passée', () => {
    const h = [
      valide(500_000, null),
      valide(600_000, '2026-09-15'),
      valide(700_000, '2026-11-01'),
      { ...valide(900_000, '2026-09-01'), statut: 'refuse' as const },
    ];
    expect(salaireAu(h, '2026-09-14')).toBe(500_000);
    expect(salaireAu(h, '2026-10-20')).toBe(600_000);
    expect(salaireAu(h, '2026-11-01')).toBe(700_000);
    expect(salaireAu([], '2026-10-20')).toBeNull();
    // Même date d'effet : la correction validée après l'emporte.
    expect(
      salaireAu(
        [valide(600_000, '2026-10-01', '2026-10-02'), valide(610_000, '2026-10-01', '2026-10-05')],
        '2026-10-20',
      ),
    ).toBe(610_000);
  });

  it('date d’effet : 3 mois en arrière au plus, sauf le salaire d’entrée', () => {
    expect(dateEffetMin('2026-10-20')).toBe('2026-07-20');
    expect(dateEffetMin('2026-05-31')).toBe('2026-02-28');
    const p = (dateEffet: string, motif: 'embauche' | 'augmentation') =>
      refusProposition({ montant: 600_000, dateEffet, motif }, motif !== 'embauche', '2026-10-20');
    expect(p('2026-07-20', 'augmentation')).toBeNull();
    expect(p('2026-07-19', 'augmentation')).toMatch(/trop ancienne/);
    expect(p('2023-03-06', 'embauche')).toBeNull();
    expect(
      refusProposition({ montant: 600_000, dateEffet: '2026-11-01', motif: 'augmentation' }, false, '2026-10-20'),
    ).toMatch(/salaire d'entrée/);
    expect(
      refusProposition({ montant: 600_000, dateEffet: '2026-11-01', motif: 'embauche' }, true, '2026-10-20'),
    ).toMatch(/déjà fixé/);
  });
});

describe('SalairesService : la RH propose, le CFO valide', () => {
  const RH = 'U-RH',
    CFO = 'U-CFO',
    CEO = 'U-CEO';
  function svc(
    o: { compte?: string | null; changement?: Record<string, unknown>; existants?: { statut: string }[] } = {},
  ) {
    const changement = {
      id: 'C1',
      dossierId: 'D1',
      montant: 700_000,
      dateEffet: '2026-11-01',
      motif: 'augmentation',
      statut: 'a_valider',
      proposeParId: RH,
      decideLe: null,
      ...o.changement,
    };
    const prisma = {
      dossierPersonnel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'D1',
          societeId: 'S1',
          prenom: 'Khadija',
          nom: 'Sow',
          utilisateurId: o.compte ?? 'U-KS',
          collaborateur: null,
        }),
      },
      changementSalaire: {
        findMany: jest.fn().mockResolvedValue(o.existants ?? [{ statut: 'valide' }]),
        findUnique: jest.fn().mockResolvedValue(changement),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      journalPaie: { create: jest.fn() },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const notifications = {
      envoyer: jest.fn(),
      titulairesRole: jest.fn((_s: string, role: string) => Promise.resolve(role === 'CFO' ? [CFO] : [CEO])),
    };
    return { s: new SalairesService(prisma, notifications as unknown as NotificationsService), prisma, notifications };
  }

  it('proposition : motif obligatoire, une seule en attente, notification au CFO sans montant', async () => {
    const { s, prisma, notifications } = svc();
    await s.proposer('D1', { montant: 700_000, dateEffet: '2026-11-01', motif: 'augmentation' }, RH);
    expect(prisma.changementSalaire.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ montant: 700_000, motif: 'augmentation', proposeParId: RH }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'salaire_a_valider', destinataireIds: [CFO] }),
    );
    expect(notifications.envoyer.mock.calls[0][0].titre).not.toMatch(/700/);
    await expect(
      svc({ existants: [{ statut: 'valide' }, { statut: 'a_valider' }] }).s.proposer(
        'D1',
        { montant: 1, dateEffet: '2026-11-01', motif: 'augmentation' },
        RH,
      ),
    ).rejects.toThrow(/attend déjà/);
  });

  it('décision : le CFO valide ; ni la RH qui a proposé, ni l’intéressé', async () => {
    const { s, prisma } = svc();
    await s.decider('C1', CFO, true);
    expect(prisma.changementSalaire.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statut: 'valide', decideParId: CFO }) }),
    );
    await expect(svc().s.decider('C1', RH, true)).rejects.toThrow(/propre proposition/);
    await expect(svc({ compte: CFO }).s.decider('C1', CFO, true)).rejects.toThrow(/propre salaire/);
    await expect(svc().s.decider('C1', CFO, false)).rejects.toThrow(/motif du refus/);
  });

  it('salaire du CFO : validé par le CEO', async () => {
    await expect(svc({ compte: CFO }).s.decider('C1', CEO, true)).resolves.toBeDefined();
    await expect(svc().s.decider('C1', CEO, true)).rejects.toThrow(/validé par le CFO/);
  });
});
