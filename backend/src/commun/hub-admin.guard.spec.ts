import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HubAdminGuard } from './hub-admin.guard';

const ctxOf = (user: unknown, slug?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params: slug ? { slug } : {} }) }),
  }) as unknown as ExecutionContext;

describe('HubAdminGuard', () => {
  it('AUTORISÉ : Administrateur HUB, quel que soit le rôle endossé, sur la société de son jeton', () => {
    expect(
      new HubAdminGuard().canActivate(ctxOf({ role: 'Salarié', adminHub: true, societeSlug: 'grey' }, 'grey')),
    ).toBe(true);
  });

  it.each([
    ['CIO sans le drapeau', { role: 'CIO (transverse)', societeSlug: 'grey' }],
    ['admin de société', { role: 'societe_admin', societeSlug: 'grey' }],
    [
      'Administrateur HUB connecté sur une autre société',
      { role: 'CEO (transverse)', adminHub: true, societeSlug: 'autre' },
    ],
    ['token absent', undefined],
  ])('REFUSÉ : %s → 403', (_l, user) => {
    expect(() => new HubAdminGuard().canActivate(ctxOf(user, 'grey'))).toThrow(ForbiddenException);
  });
});
