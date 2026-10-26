import { PrismaService } from '../../prisma/prisma.service';
import { contexteDecision, dateLivraison } from './suppleance';

// Suppléance du jour (revue Dir. GC, 21/10/2026, lot 4).
describe('contexteDecision', () => {
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
    const c = await contexteDecision(prisma([]), 'S1', '2026-11-17');
    expect(c).toMatchObject({ ctoSupplee: false, comptesDplg: ['DG1', 'DG2'], comptesCto: ['CTO'] });
    expect(c.dplgCollaborateurs.has('F-DG1')).toBe(true);
  });

  it('Dir. GC absent sans suppléant : le CTO tient sa place et reçoit ses décisions', async () => {
    const c = await contexteDecision(
      prisma([{ utilisateurId: 'DG1', collaborateurId: 'F-DG1', suppleantId: null }]),
      'S1',
      '2026-11-17',
    );
    expect(c.ctoSupplee).toBe(true);
    expect(c.comptesDplg.sort()).toEqual(['CTO', 'DG2']);
    expect(c.collaborateursAbsents.has('F-DG1')).toBe(true);
  });

  it('suppléance confiée à un autre Dir. GC : le CTO n’intervient pas', async () => {
    const c = await contexteDecision(
      prisma([{ utilisateurId: 'DG1', collaborateurId: null, suppleantId: 'DG2' }]),
      'S1',
      '2026-11-17',
    );
    expect(c).toMatchObject({ ctoSupplee: false, comptesDplg: ['DG2'] });
  });

  it('suppléance confiée au CTO : le CTO tient sa place', async () => {
    const c = await contexteDecision(
      prisma([{ utilisateurId: 'DG1', collaborateurId: null, suppleantId: 'CTO' }]),
      'S1',
      '2026-11-17',
    );
    expect(c.ctoSupplee).toBe(true);
  });
});

describe('dateLivraison', () => {
  it('jour J de l’horizon (8 h par jour ouvré), fériés exclus ; rien avant l’ouverture', () => {
    expect(dateLivraison({ ouvertLe: '2026-10-01', budgetHeures: 80 }, new Set())).toBe('2026-10-14');
    expect(dateLivraison({ ouvertLe: '2026-10-01', budgetHeures: 80 }, new Set(['2026-10-05']))).toBe('2026-10-15');
    expect(dateLivraison({ ouvertLe: null, budgetHeures: 80 }, new Set())).toBeNull();
  });
});
