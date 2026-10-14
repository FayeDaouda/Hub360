import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReglagesService } from '../../reglages/reglages.service';
import { ProjetsOuvertsService, statutChantier } from './projets-ouverts.service';

// Statut simple « En conception / En chantier / Livré » (décision du
// 14/10/2026), porté par Projet.phase : la facturation SU/EX s'y fie.

describe('statutChantier', () => {
  it.each([
    ['avant_projet', 'conception'],
    ['permis', 'conception'],
    ['etudes', 'conception'],
    ['chantier', 'chantier'],
    ['livre', 'livre'],
  ] as const)('phase %s → %s', (phase, attendu) => {
    expect(statutChantier(phase)).toBe(attendu);
  });
});

describe('ProjetsOuvertsService.definirStatutChantier', () => {
  function svc(projet: unknown) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = { projet: { findFirst: jest.fn().mockResolvedValue(projet), update } };
    return { s: new ProjetsOuvertsService(prisma as unknown as PrismaService, {} as ReglagesService), update };
  }

  it('en chantier / livré : la phase prend la même valeur', async () => {
    const { s, update } = svc({ id: 'P1', categorie: 'conception' });
    await s.definirStatutChantier('S1', 'P1', 'chantier');
    expect(update).toHaveBeenCalledWith({ where: { id: 'P1' }, data: { phase: 'chantier' } });
    await s.definirStatutChantier('S1', 'P1', 'livre');
    expect(update).toHaveBeenLastCalledWith({ where: { id: 'P1' }, data: { phase: 'livre' } });
  });

  it('retour en conception : première phase de la catégorie', async () => {
    const { s, update } = svc({ id: 'P1', categorie: 'amenagement' });
    await s.definirStatutChantier('S1', 'P1', 'conception');
    expect(update).toHaveBeenCalledWith({ where: { id: 'P1' }, data: { phase: 'avant_projet' } });
  });

  it('projet d’une autre société ou pas encore ouvert → 404', async () => {
    const { s, update } = svc(null);
    await expect(s.definirStatutChantier('S1', 'PX', 'chantier')).rejects.toThrow(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
