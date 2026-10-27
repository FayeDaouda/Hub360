import { PrismaService } from '../prisma/prisma.service';
import { decisionContext, deliveryDate, isDeliverySoon } from './decision-context';

// Suppléance du jour (revue Dir. GC, 21/10/2026, lot 4).
describe('decisionContext', () => {
  function prisma(absences: { utilisateurId: string; collaborateurId: string | null; suppleantId: string | null }[]) {
    const roles: Record<string, string[]> = { 'Dir. GC': ['DG1', 'DG2'], 'CTO (transverse)': ['CTO'] };
    return {
      utilisateurSocieteRole: {
        findMany: jest.fn(({ where }: { where: { role: { nom: string } } }) =>
          Promise.resolve((roles[where.role.nom] ?? []).map((utilisateurId) => ({ utilisateurId }))),
        ),
      },
      demandeAbsence: {
        findMany: jest.fn().mockResolvedValue(
          absences.map((a) => ({
            suppleantId: a.suppleantId,
            dossier: { utilisateurId: a.utilisateurId, collaborateurId: a.collaborateurId },
          })),
        ),
      },
      collaborateur: { findMany: jest.fn().mockResolvedValue([{ id: 'F-DG1' }]) },
    } as unknown as PrismaService;
  }

  it('personne d’absent : les Dir. GC décident, le CTO ne supplée pas', async () => {
    const c = await decisionContext(prisma([]), 'S1', '2026-11-17');
    expect(c).toMatchObject({ ctoStandsIn: false, dplgAccounts: ['DG1', 'DG2'], ctoAccounts: ['CTO'] });
    expect(c.dplgEmployees.has('F-DG1')).toBe(true);
  });

  it('Dir. GC absent sans suppléant : le CTO tient sa place et reçoit ses décisions', async () => {
    const c = await decisionContext(
      prisma([{ utilisateurId: 'DG1', collaborateurId: 'F-DG1', suppleantId: null }]),
      'S1',
      '2026-11-17',
    );
    expect(c.ctoStandsIn).toBe(true);
    expect(c.dplgAccounts.sort()).toEqual(['CTO', 'DG2']);
    expect(c.absentEmployees.has('F-DG1')).toBe(true);
  });

  it('suppléance confiée à un autre Dir. GC : le CTO n’intervient pas', async () => {
    const c = await decisionContext(
      prisma([{ utilisateurId: 'DG1', collaborateurId: null, suppleantId: 'DG2' }]),
      'S1',
      '2026-11-17',
    );
    expect(c).toMatchObject({ ctoStandsIn: false, dplgAccounts: ['DG2'] });
  });

  it('suppléance confiée au CTO : le CTO tient sa place', async () => {
    const c = await decisionContext(
      prisma([{ utilisateurId: 'DG1', collaborateurId: null, suppleantId: 'CTO' }]),
      'S1',
      '2026-11-17',
    );
    expect(c.ctoStandsIn).toBe(true);
  });
});

describe('deliveryDate', () => {
  it('jour J de l’horizon (8 h par jour ouvré), fériés exclus ; rien avant l’ouverture', () => {
    expect(deliveryDate({ ouvertLe: '2026-10-01', budgetHeures: 80 }, new Set())).toBe('2026-10-14');
    expect(deliveryDate({ ouvertLe: '2026-10-01', budgetHeures: 80 }, new Set(['2026-10-05']))).toBe('2026-10-15');
    expect(deliveryDate({ ouvertLe: null, budgetHeures: 80 }, new Set())).toBeNull();
  });
});

describe('isDeliverySoon', () => {
  it('projet non livré, livraison entre aujourd’hui et J+15 inclus', () => {
    expect(isDeliverySoon('chantier', '2026-10-27', '2026-10-27')).toBe(true);
    expect(isDeliverySoon('conception', '2026-11-11', '2026-10-27')).toBe(true);
    expect(isDeliverySoon('conception', '2026-11-12', '2026-10-27')).toBe(false);
    expect(isDeliverySoon('conception', '2026-10-26', '2026-10-27')).toBe(false); // déjà dépassée
    expect(isDeliverySoon('livre', '2026-10-30', '2026-10-27')).toBe(false);
  });
});
