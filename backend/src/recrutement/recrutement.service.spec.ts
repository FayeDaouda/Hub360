import { RecrutementService } from './recrutement.service';

// Données personnelles : une candidature refusée s'efface 12 mois après le refus.
describe('RecrutementService · effacement à 12 mois', () => {
  it('efface les candidatures refusées depuis plus de 12 mois, et elles seules', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const s = new RecrutementService({ candidature: { deleteMany } } as never, {} as never, {} as never);
    await s.purger(new Date('2026-11-02T03:30:00Z'));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { etape: 'refusee', decideLe: { lt: new Date('2025-11-02T03:30:00Z') } },
    });
  });
});
