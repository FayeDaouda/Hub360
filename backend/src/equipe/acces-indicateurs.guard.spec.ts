import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccesIndicateursGuard } from './acces-indicateurs.guard';

// GET …/collaborateurs/:id/indicateurs — un collaborateur ne voit QUE ses
// propres indicateurs ; l'admin voit ceux de n'importe qui dans SA société.
// Trois axes : autorisé / refusé dans le périmètre (fiche d'un autre) / hors
// périmètre (autre société → la fiche n'est pas trouvée).

type User = {
  societeId: string;
  societeSlug: string | null;
  userId: string;
  role: string;
};
const COLLAB: User = {
  societeId: 'S1',
  societeSlug: 'grey',
  userId: 'U1',
  role: 'collaborateur',
};

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

function prisma(fiche: unknown) {
  const findFirst = jest.fn().mockResolvedValue(fiche);
  return {
    svc: { collaborateur: { findFirst } } as unknown as PrismaService,
    findFirst,
  };
}

const req = (o: Partial<{ user: User; params: { slug: string; id: string } }> = {}) => ({
  user: COLLAB,
  params: { slug: 'grey', id: 'C1' },
  ...o,
});

describe('AccesIndicateursGuard', () => {
  it('societe_admin : autorisé, sans requête base', async () => {
    const { svc, findFirst } = prisma(null);
    await expect(
      new AccesIndicateursGuard(svc).canActivate(
        ctxOf(req({ user: { ...COLLAB, role: 'societe_admin' } })),
      ),
    ).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('HORS PÉRIMÈTRE : token d’une autre société → 403', async () => {
    const { svc } = prisma(null);
    await expect(
      new AccesIndicateursGuard(svc).canActivate(
        ctxOf(req({ user: { ...COLLAB, societeSlug: 'autre' } })),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rôle ni admin ni collaborateur → 403', async () => {
    const { svc } = prisma(null);
    await expect(
      new AccesIndicateursGuard(svc).canActivate(
        ctxOf(req({ user: { ...COLLAB, role: 'holding_admin' } })),
      ),
    ).rejects.toThrow(/non autorisé/);
  });

  it('AUTORISÉ : la fiche :id est bien liée à son compte', async () => {
    const { svc, findFirst } = prisma({ utilisateurId: 'U1' });
    await expect(
      new AccesIndicateursGuard(svc).canActivate(ctxOf(req())),
    ).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'C1', societeId: 'S1' }),
      }),
    );
  });

  it('REFUSÉ DANS LE PÉRIMÈTRE : la fiche :id appartient à un autre compte → 403', async () => {
    const { svc } = prisma({ utilisateurId: 'U2' });
    await expect(
      new AccesIndicateursGuard(svc).canActivate(ctxOf(req())),
    ).rejects.toThrow(/vos propres indicateurs/);
  });

  it('HORS PÉRIMÈTRE : fiche introuvable dans sa société → 403', async () => {
    const { svc } = prisma(null);
    await expect(
      new AccesIndicateursGuard(svc).canActivate(ctxOf(req())),
    ).rejects.toThrow(/vos propres indicateurs/);
  });

  it('token absent → 403', async () => {
    const { svc } = prisma(null);
    await expect(
      new AccesIndicateursGuard(svc).canActivate(ctxOf(req({ user: undefined }))),
    ).rejects.toThrow(ForbiddenException);
  });
});
