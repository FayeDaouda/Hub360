import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReglagesService } from '../reglages/reglages.service';
import { ProductionService } from './production.service';
import { ProjectStatesService } from './project-states.service';

// Droits de départ du lot 5 (matrice, 31/10/2026), par rôle.
const DG = {
  projets: 'LE',
  'projets.assignation': 'E',
  'projets.validation': 'V',
  'projets.visa': 'V',
  'projets.prolongations': 'V',
  'projets.ts': 'E',
  'projets.fils': 'E',
  'projets.production': 'L',
};
const CTO_P = {
  projets: 'LE',
  'projets.assignation': 'E',
  'projets.validation': 'V',
  'projets.prolongations': 'V',
  'projets.ts': 'EV',
  'projets.fils': 'E',
  'projets.production': 'L',
};
const CEO_P = { projets: 'L', 'projets.fils': 'E', 'projets.production': 'L' };
const SAL = { projets: 'L', 'projets.fils': 'E' };

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : le Dir. GC voit
// les projets dont il porte le dossier ; le CTO et le CEO, tous.
describe('ProductionService.production · périmètre', () => {
  function svc() {
    const prisma = {
      projet: { findMany: jest.fn().mockResolvedValue([]) },
      demandeTs: { groupBy: jest.fn().mockResolvedValue([]) },
      cellule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const reglages = {
      joursFeries: jest.fn().mockResolvedValue(new Map()),
      regle: jest.fn().mockResolvedValue({ de: 70, a: 100 }),
    } as unknown as ReglagesService;
    const db = prisma as unknown as PrismaService;
    return { s: new ProductionService(db, reglages, new ProjectStatesService(db, reglages)), prisma };
  }

  it('Dir. GC : ses dossiers seulement', async () => {
    const { s, prisma } = svc();
    const r = await s.production('S1', { userId: 'DG', role: 'Dir. GC', permissions: DG });
    expect(prisma.projet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ dossierCrm: { proprietaireId: 'DG' } }) }),
    );
    expect(r).toMatchObject({ perimetre: 'mes_projets', chiffres: { ouverts: 0, chargeMoyenne: null }, lignes: [] });
  });

  it('CTO et CEO : tous les projets ; sans la Lecture de l’étape : refusé', async () => {
    for (const [role, permissions] of [
      ['CTO (transverse)', CTO_P],
      ['CEO (transverse)', CEO_P],
    ] as const) {
      const { s, prisma } = svc();
      expect((await s.production('S1', { userId: 'U', role, permissions })).perimetre).toBe('tous');
      expect(prisma.projet.findMany.mock.calls[0][0].where).not.toHaveProperty('dossierCrm');
    }
    for (const role of ['CFO', 'Salarié', 'CIO (transverse)']) {
      await expect(svc().s.production('S1', { userId: 'U', role, permissions: SAL })).rejects.toThrow(
        ForbiddenException,
      );
    }
  });
});
