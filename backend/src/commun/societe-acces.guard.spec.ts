import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SocieteAccesGuard } from './societe-acces.guard';

// Garde de tout le back-office admin : exige à la fois le bon rôle
// (societe_admin) ET le bon slug — contrairement à MembreSocieteGuard qui
// n'exige que le slug.

type User = { societeSlug: string | null; role: string };

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const req = (o: Partial<{ user: User; params: { slug: string } }> = {}) => ({
  user: { societeSlug: 'grey', role: 'societe_admin' } as User,
  params: { slug: 'grey' },
  ...o,
});

describe('SocieteAccesGuard', () => {
  it('AUTORISÉ : societe_admin du bon slug', () => {
    expect(new SocieteAccesGuard().canActivate(ctxOf(req()))).toBe(true);
  });

  it('REFUSÉ DANS LE PÉRIMÈTRE : collaborateur du bon slug → 403 (rôle insuffisant)', () => {
    expect(() =>
      new SocieteAccesGuard().canActivate(ctxOf(req({ user: { societeSlug: 'grey', role: 'collaborateur' } }))),
    ).toThrow(ForbiddenException);
  });

  it('HORS PÉRIMÈTRE : societe_admin d’une autre société → 403', () => {
    expect(() =>
      new SocieteAccesGuard().canActivate(ctxOf(req({ user: { societeSlug: 'autre', role: 'societe_admin' } }))),
    ).toThrow(ForbiddenException);
  });

  it('token absent → 403', () => {
    expect(() => new SocieteAccesGuard().canActivate(ctxOf(req({ user: undefined })))).toThrow(ForbiddenException);
  });
});
