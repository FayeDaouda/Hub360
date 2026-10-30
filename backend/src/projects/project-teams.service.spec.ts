import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { projectScope } from './review-rules';
import { ProjectTeamsService } from './project-teams.service';

// Équipes d'un projet (29/10/2026) : le Dir. GC les affecte ; les membres
// voient les projets de leur équipe.
describe('ProjectTeamsService.setTeams', () => {
  function svc(cellsFound: number) {
    const tx = { projetCellule: { deleteMany: jest.fn(), createMany: jest.fn() } };
    const prisma = {
      projet: { findFirst: jest.fn().mockResolvedValue({ id: 'P1', cellules: [] }) },
      cellule: { count: jest.fn().mockResolvedValue(cellsFound), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { tx, s: new ProjectTeamsService(prisma as unknown as PrismaService) };
  }

  it('remplace les équipes : retire les autres, ajoute les nouvelles sans doublon', async () => {
    const { s, tx } = svc(2);
    await s.setTeams('S1', 'P1', ['CEL1', 'CEL2', 'CEL1']);
    expect(tx.projetCellule.deleteMany).toHaveBeenCalledWith({
      where: { projetId: 'P1', celluleId: { notIn: ['CEL1', 'CEL2'] } },
    });
    expect(tx.projetCellule.createMany).toHaveBeenCalledWith({
      data: [
        { projetId: 'P1', celluleId: 'CEL1' },
        { projetId: 'P1', celluleId: 'CEL2' },
      ],
      skipDuplicates: true,
    });
  });

  it('équipe d’une autre société (ou inconnue) → 400, rien modifié', async () => {
    const { s, tx } = svc(1);
    await expect(s.setTeams('S1', 'P1', ['CEL1', 'AUTRE'])).rejects.toThrow(BadRequestException);
    expect(tx.projetCellule.deleteMany).not.toHaveBeenCalled();
  });
});

describe('projectScope · Salarié', () => {
  it('voit aussi les projets affectés à son équipe', () => {
    expect(projectScope('Salarié', 'C1')).toEqual({
      OR: [
        { cartes: { some: { taches: { some: { assigneId: 'C1' } } } } },
        { cellules: { some: { cellule: { dispatcherId: 'C1' } } } },
        { cellules: { some: { cellule: { membres: { some: { id: 'C1' } } } } } },
      ],
    });
  });

  it('les autres rôles : aucun filtre', () => {
    expect(projectScope('Dir. GC', null)).toEqual({});
  });
});
