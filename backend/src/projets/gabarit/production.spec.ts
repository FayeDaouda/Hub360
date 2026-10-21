import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { ProjetsOuvertsService } from './projets-ouverts.service';

// Tableau de production (revue Dir. GC, 21/10/2026, lot 6) : le Dir. GC voit
// les projets dont il porte le dossier ; le CTO et le CEO, tous.
describe('ProjetsOuvertsService.production · périmètre', () => {
  function svc() {
    const prisma = {
      projet: { findMany: jest.fn().mockResolvedValue([]) },
      demandeTs: { groupBy: jest.fn().mockResolvedValue([]) },
      cellule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const reglages = { joursFeries: jest.fn().mockResolvedValue(new Map()), regle: jest.fn().mockResolvedValue({ de: 70, a: 100 }) } as unknown as ReglagesService;
    return { s: new ProjetsOuvertsService(prisma as unknown as PrismaService, reglages), prisma };
  }

  it('Dir. GC : ses dossiers seulement', async () => {
    const { s, prisma } = svc();
    const r = await s.production('S1', { userId: 'DG', role: 'Dir. GC' });
    expect(prisma.projet.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dossierCrm: { proprietaireId: 'DG' } }) }));
    expect(r).toMatchObject({ perimetre: 'mes_projets', chiffres: { ouverts: 0, chargeMoyenne: null }, lignes: [] });
  });

  it('CTO et CEO : tous les projets ; les autres rôles : refusé', async () => {
    for (const role of ['CTO (transverse)', 'CEO (transverse)']) {
      const { s, prisma } = svc();
      expect((await s.production('S1', { userId: 'U', role })).perimetre).toBe('tous');
      expect(prisma.projet.findMany.mock.calls[0][0].where).not.toHaveProperty('dossierCrm');
    }
    for (const role of ['CFO', 'Salarié', 'CIO (transverse)']) {
      await expect(svc().s.production('S1', { userId: 'U', role })).rejects.toThrow(ForbiddenException);
    }
  });
});
