import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hacherJeton } from '../auth/jetons';
import { DevisPublicGuard } from './devis-public.guard';

// Porte du lien public — trois cas doivent produire EXACTEMENT la même
// erreur (404, message générique) : absent, malformé/inconnu, et un jeton
// dont le hash ne correspond à rien. Aucune branche ne doit permettre de
// distinguer ces cas (anti-énumération, cf. commentaire du guard).

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

function prisma(devis: { id: string } | null) {
  const findFirst = jest.fn().mockResolvedValue(devis);
  return { svc: { devis: { findFirst } } as unknown as PrismaService, findFirst };
}

describe('DevisPublicGuard', () => {
  it('AUTORISÉ : jeton valide, le where interroge par le HASH du jeton (jamais le clair)', async () => {
    const clair = 'un-jeton-clair-de-test';
    const { svc, findFirst } = prisma({ id: 'D1' });
    await expect(
      new DevisPublicGuard(svc).canActivate(ctxOf({ params: { token: clair } })),
    ).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenPublicHash: hacherJeton(clair) },
      }),
    );
    // Le clair ne doit jamais apparaître tel quel dans la requête envoyée à
    // la base — seul son empreinte.
    const where = findFirst.mock.calls[0][0].where;
    expect(where.tokenPublicHash).not.toBe(clair);
  });

  it('token absent des params → 404, sans requête base', async () => {
    const { svc, findFirst } = prisma(null);
    await expect(
      new DevisPublicGuard(svc).canActivate(ctxOf({ params: {} })),
    ).rejects.toThrow(NotFoundException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('token sans correspondance en base → 404 (même erreur que « absent »)', async () => {
    const { svc } = prisma(null);
    await expect(
      new DevisPublicGuard(svc).canActivate(ctxOf({ params: { token: 'inconnu' } })),
    ).rejects.toThrow(NotFoundException);
  });
});
