import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SocieteAdminOuCioGuard } from './societe-admin-ou-cio.guard';
import { ROLE_CIO } from '@hub/domain';

// Deux chemins d'autorisation légitimes, testés séparément — comme pour le
// dispatcher de cellule (« admin OU dispatcher ») : societe_admin ou CIO,
// chacun connecté sur la société de l'URL (les services lisent la société
// du jeton — un jeton d'une autre société écrirait au mauvais endroit).

type User = { societeSlug: string | null; role: string; adminHub?: boolean };

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const req = (o: Partial<{ user: User; params: { slug: string } }> = {}) => ({
  user: { societeSlug: 'grey', role: 'societe_admin' } as User,
  params: { slug: 'grey' },
  ...o,
});

describe('SocieteAdminOuCioGuard', () => {
  it('AUTORISÉ : Administrateur HUB connecté sur cette société, quel que soit le rôle endossé', () => {
    const user = { societeSlug: 'grey', role: 'CFO', adminHub: true };
    expect(new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user })))).toBe(true);
  });

  it('REFUSÉ : Administrateur HUB dont le jeton porte une AUTRE société → 403', () => {
    const user = { societeSlug: 'autre', role: 'CFO', adminHub: true };
    expect(() => new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user })))).toThrow(ForbiddenException);
  });

  it('AUTORISÉ : societe_admin de la bonne société, sans être CIO', () => {
    expect(new SocieteAdminOuCioGuard().canActivate(ctxOf(req()))).toBe(true);
  });

  it('AUTORISÉ : CIO connecté sur cette société, sans être societe_admin', () => {
    expect(
      new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: { societeSlug: 'grey', role: ROLE_CIO } }))),
    ).toBe(true);
  });

  it('REFUSÉ : CIO dont le jeton porte une AUTRE société → 403 (sinon écriture dans la société du jeton)', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: { societeSlug: 'autre', role: ROLE_CIO } }))),
    ).toThrow(ForbiddenException);
  });

  it('REFUSÉ : societe_admin d’une AUTRE société → 403', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: { societeSlug: 'autre', role: 'societe_admin' } }))),
    ).toThrow(ForbiddenException);
  });

  it('REFUSÉ : ni societe_admin ni CIO (ex. collaborateur, Dir. GC) → 403', () => {
    expect(() =>
      new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: { societeSlug: 'grey', role: 'collaborateur' } }))),
    ).toThrow(ForbiddenException);
  });

  it('token absent → 403', () => {
    expect(() => new SocieteAdminOuCioGuard().canActivate(ctxOf(req({ user: undefined })))).toThrow(ForbiddenException);
  });
});
