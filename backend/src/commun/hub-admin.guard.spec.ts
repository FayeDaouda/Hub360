import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HubAdminGuard } from './hub-admin.guard';

const ctxOf = (user: unknown, slug?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params: slug ? { slug } : {} }) }),
  }) as unknown as ExecutionContext;

// Carte blanche (Administrateur HUB, CIO depuis le 31/10/2026) : matrice,
// interventions, interrupteurs — sur la société du jeton seulement.
describe('HubAdminGuard', () => {
  it.each([
    ['Administrateur HUB, quel que soit le rôle endossé', { role: 'Salarié', adminHub: true, fullAccess: true }],
    ['CIO', { role: 'CIO (transverse)', fullAccess: true }],
  ])('AUTORISÉ : %s, sur la société de son jeton', (_l, user) => {
    expect(new HubAdminGuard().canActivate(ctxOf({ ...user, societeSlug: 'grey' }, 'grey'))).toBe(true);
  });

  it.each([
    ['admin de société', { role: 'societe_admin', fullAccess: false, societeSlug: 'grey' }],
    ['CEO', { role: 'CEO (transverse)', fullAccess: false, societeSlug: 'grey' }],
    [
      'carte blanche connectée sur une autre société',
      { role: 'CIO (transverse)', fullAccess: true, societeSlug: 'autre' },
    ],
    ['token absent', undefined],
  ])('REFUSÉ : %s → 403', (_l, user) => {
    expect(() => new HubAdminGuard().canActivate(ctxOf(user, 'grey'))).toThrow(ForbiddenException);
  });
});
