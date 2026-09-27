import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SocieteAdminOuCioGuard, ROLE_CIO } from './societe-admin-ou-cio.guard';

// Deux chemins d'autorisation légitimes, testés séparément — comme pour le
// dispatcher de cellule (« admin OU dispatcher ») : societe_admin DE la
// bonne société, ou le CIO (transverse, aucun lien de société à vérifier).

type User = { societeSlug: string | null; role: string };

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const req = (o: Partial<{ user: User; params: { slug: string } }> = {}) => ({
  user: { societeSlug: 'grey', role: 'societe_admin' } as User,
  params: { slug: 'grey' },
  ...o,
});

describe('SocieteAdminOuCioGuard', () => {
  it('AUTORISÉ : societe_admin de la bonne société, sans être CIO', () => {
    expect(new SocieteAdminOuCioGuard().canActivate(ctxOf(req()))).toBe(true);
  });

  it('AUTORISÉ : CIO, sans être societe_admin', () => {
    expect(
      new SocieteAdminOuCioGuard().canActivate(
        ctxOf(req({ user: { societeSlug: null, role: ROLE_CIO } })),
      ),
    ).toBe(true);
  });

  it('AUTORISÉ : CIO même si le token porte une autre société (rôle transverse, pas de lien slug)', () => {
    expect(
      new SocieteAdminOuCioGuard().canActivate(
        ctxOf(req({ user: { societeSlug: 'autre', role: ROLE_CIO } })),
      ),
    ).toBe(true);
  });

  it('REFUSÉ : societe_admin d’une AUTRE société → 403', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(
        ctxOf(req({ user: { societeSlug: 'autre', role: 'societe_admin' } })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('REFUSÉ : ni societe_admin ni CIO (ex. collaborateur, Dir. GC) → 403', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(
        ctxOf(req({ user: { societeSlug: 'grey', role: 'collaborateur' } })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('token absent → 403', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: undefined }))),
    ).toThrow(ForbiddenException);
  });
});
