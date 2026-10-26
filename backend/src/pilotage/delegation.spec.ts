import { agitPourCeo, avecDelegataire } from '../commun/delegation-ceo';
import { DelegationService } from './delegation.service';
import { PilotageService } from './pilotage.service';

// Délégation du CEO (revue CEO, 22/10/2026).
const enFonction = (delegataireId: string | null) => ({
  delegationCeo: { findFirst: jest.fn().mockResolvedValue(delegataireId ? { delegataireId } : null) },
});

describe('délégation · lecture commune', () => {
  it('le CEO, ou le délégataire en fonction (CTO ou CFO) ; jamais un autre rôle', async () => {
    const prisma = enFonction('CFO1') as never;
    expect(await agitPourCeo(prisma, { userId: 'CEO1', societeId: 'S1', role: 'CEO (transverse)' })).toBe(true);
    expect(await agitPourCeo(prisma, { userId: 'CFO1', societeId: 'S1', role: 'CFO' })).toBe(true);
    expect(await agitPourCeo(prisma, { userId: 'CTO1', societeId: 'S1', role: 'CTO (transverse)' })).toBe(false);
    expect(await agitPourCeo(enFonction('X') as never, { userId: 'X', societeId: 'S1', role: 'COO' })).toBe(false);
  });

  it('destinataires : le délégataire en plus, sauf s’il est le demandeur', async () => {
    expect(await avecDelegataire(enFonction('CFO1') as never, 'S1', ['CEO1'], 'DG')).toEqual(['CEO1', 'CFO1']);
    expect(await avecDelegataire(enFonction('CFO1') as never, 'S1', ['CEO1'], 'CFO1')).toEqual(['CEO1']);
    expect(await avecDelegataire(enFonction(null) as never, 'S1', ['CEO1'], 'DG')).toEqual(['CEO1']);
  });
});

describe('DelegationService.creer', () => {
  function svc(o: { affectation?: unknown; chevauche?: number } = {}) {
    const prisma = {
      utilisateurSocieteRole: {
        findFirst: jest.fn().mockResolvedValue(o.affectation ?? null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      delegationCeo: {
        count: jest.fn().mockResolvedValue(o.chevauche ?? 0),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      utilisateur: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notifications = { envoyer: jest.fn(), titulairesRole: jest.fn().mockResolvedValue(['CIO1']) };
    return { s: new DelegationService(prisma as never, notifications as never), prisma, notifications };
  }
  const ceo = { userId: 'CEO1', societeId: 'S1', role: 'CEO (transverse)' };
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const cfo = { role: { nom: 'CFO' }, utilisateur: { prenom: 'Bineta', nom: 'Sarr' } };

  it('le CEO seul, un CTO ou un CFO actif, période valide et sans chevauchement', async () => {
    await expect(
      svc({ affectation: cfo }).s.creer(
        { ...ceo, role: 'CIO (transverse)' },
        { delegataireId: 'CFO1', du: demain, au: demain },
      ),
    ).rejects.toThrow('Seul le CEO');
    await expect(svc().s.creer(ceo, { delegataireId: 'COO1', du: demain, au: demain })).rejects.toThrow(
      'CTO ou le CFO',
    );
    await expect(
      svc({ affectation: cfo }).s.creer(ceo, { delegataireId: 'CFO1', du: '2020-01-01', au: demain }),
    ).rejects.toThrow('passé');
    await expect(
      svc({ affectation: cfo, chevauche: 1 }).s.creer(ceo, { delegataireId: 'CFO1', du: demain, au: demain }),
    ).rejects.toThrow('révoquez');
    const { s, prisma, notifications } = svc({ affectation: cfo });
    await s.creer(ceo, { delegataireId: 'CFO1', du: demain, au: demain });
    expect(prisma.delegationCeo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delegataireId: 'CFO1', roleDelegataire: 'CFO' }),
    });
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delegation_ceo',
        destinataireIds: ['CFO1', 'CIO1'],
        titre: expect.stringContaining('jamais : droits du CIO'),
      }),
    );
  });
});

describe('arbitrage par le délégataire', () => {
  it('jamais sa propre proposition', async () => {
    const prisma = {
      ...enFonction('CTO1'),
      decisionRegistre: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'D5',
          proposition: 'proposee',
          creeParId: 'CTO1',
          texte: 't',
          echeance: '2099-01-01',
        }),
      },
    };
    const s = new PilotageService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { envoyer: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      s.arbitrer({ userId: 'CTO1', societeId: 'S1', role: 'CTO (transverse)' }, 'D5', { issue: 'accepter' }),
    ).rejects.toThrow('votre propre proposition');
  });
});
