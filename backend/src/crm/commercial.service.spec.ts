import { PrismaService } from '../prisma/prisma.service';
import { CommercialService } from './commercial.service';
import type { CommissionsService } from './commissions.service';

// Lead archivé : hors des calculs du commercial (décision du 29/10/2026),
// dans le pipeline en cours comme dans la performance et les totaux de l'année.
describe('CommercialService · leads archivés', () => {
  it('les deux lectures écartent les leads archivés', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const s = new CommercialService(
      { dossierCrm: { findMany } } as unknown as PrismaService,
      { synchroniser: jest.fn() } as unknown as CommissionsService,
    );
    await s.vue({ societeId: 'S1', role: 'COO', permissions: {} }, '2026');
    expect(findMany).toHaveBeenCalledTimes(2);
    for (const [arg] of findMany.mock.calls) expect(arg.where).toMatchObject({ societeId: 'S1', archiveLe: null });
  });
});
