import { SyntheseService } from './synthese.service';

// Synthèse mensuelle du CEO (revue CEO, 22/10/2026).
describe('SyntheseService', () => {
  function svc(o: {
    journal: { mois: string; action: string; createdAt: Date }[];
    existante?: { genereLe: Date } | null;
  }) {
    const prisma = {
      journalCloture: {
        findMany: jest.fn(({ where }: { where: { action?: string } }) =>
          Promise.resolve(
            o.journal
              .filter((j) => !where.action || j.action === where.action)
              .map((j) => ({ ...j, societeId: 'S1' }))
              .sort((a, b) =>
                where.action
                  ? b.createdAt.getTime() - a.createdAt.getTime()
                  : a.createdAt.getTime() - b.createdAt.getTime(),
              ),
          ),
        ),
      },
      syntheseMensuelle: {
        findUnique: jest.fn().mockResolvedValue(o.existante ?? null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    const notifications = {
      titulairesRole: jest.fn((_s: string, r: string) => Promise.resolve([r])),
      envoyer: jest.fn(),
    };
    const s = new SyntheseService(prisma as never, notifications as never, {} as never, {} as never, {} as never);
    jest.spyOn(s, 'calculer').mockResolvedValue([{ titre: 'Facturation', lignes: [] }]);
    return { s, prisma, notifications };
  }
  const le = (j: string) => new Date(`${j}T10:00:00Z`);

  it('mois clôturé sans synthèse : générée, CEO et CFO prévenus', async () => {
    const { s, prisma, notifications } = svc({
      journal: [{ mois: '2026-09', action: 'cloture', createdAt: le('2026-10-05') }],
    });
    await s.synchroniser();
    expect(prisma.syntheseMensuelle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { societeId_mois: { societeId: 'S1', mois: '2026-09' } } }),
    );
    expect(notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'synthese_mensuelle',
        destinataireIds: ['CEO (transverse)', 'CFO'],
        titre: expect.stringContaining('disponible'),
      }),
    );
  });

  it('déjà à jour : rien ; rouvert puis clôturé de nouveau : régénérée (« mise à jour »)', async () => {
    const aJour = svc({
      journal: [{ mois: '2026-09', action: 'cloture', createdAt: le('2026-10-05') }],
      existante: { genereLe: le('2026-10-06') },
    });
    await aJour.s.synchroniser();
    expect(aJour.prisma.syntheseMensuelle.upsert).not.toHaveBeenCalled();
    const recloture = svc({
      journal: [
        { mois: '2026-09', action: 'cloture', createdAt: le('2026-10-05') },
        { mois: '2026-09', action: 'reouverture', createdAt: le('2026-10-08') },
        { mois: '2026-09', action: 'cloture', createdAt: le('2026-10-09') },
      ],
      existante: { genereLe: le('2026-10-06') },
    });
    await recloture.s.synchroniser();
    expect(recloture.notifications.envoyer).toHaveBeenCalledWith(
      expect.objectContaining({ titre: expect.stringContaining('mise à jour') }),
    );
  });

  it('mois rouvert (pas clôturé) : pas de synthèse', async () => {
    const { s, prisma } = svc({
      journal: [
        { mois: '2026-09', action: 'cloture', createdAt: le('2026-10-05') },
        { mois: '2026-09', action: 'reouverture', createdAt: le('2026-10-08') },
      ],
    });
    await s.synchroniser();
    expect(prisma.syntheseMensuelle.upsert).not.toHaveBeenCalled();
  });

  it('commentaire : le CFO seul', async () => {
    const { s } = svc({ journal: [] });
    await expect(
      s.commenter({ userId: 'U', societeId: 'S1', role: 'CEO (transverse)' }, '2026-09', 'ok'),
    ).rejects.toThrow('CFO');
  });
});
