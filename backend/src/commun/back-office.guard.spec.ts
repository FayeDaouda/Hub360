import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BackOfficeGuard } from './back-office.guard';

function ctx(user: object | undefined, slug = 'grey-concrete') {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params: { slug } }) }),
  } as unknown as ExecutionContext;
}

describe('BackOfficeGuard', () => {
  const guard = new BackOfficeGuard();

  it.each(['societe_admin', 'Dir. GC', 'COO', 'CFO', 'CEO (transverse)'])(
    '%s de la société → entre (le module décide ensuite)',
    (role) => {
      expect(guard.canActivate(ctx({ role, societeSlug: 'grey-concrete' }))).toBe(true);
    },
  );

  it.each(['holding_admin'])('%s → 403 (espace dédié ailleurs)', (role) => {
    expect(() => guard.canActivate(ctx({ role, societeSlug: 'grey-concrete' }))).toThrow(ForbiddenException);
  });

  it('autre société → 403', () => {
    expect(() => guard.canActivate(ctx({ role: 'COO', societeSlug: 'codd-group' }))).toThrow(ForbiddenException);
  });

  it('pas d’utilisateur → 403', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
