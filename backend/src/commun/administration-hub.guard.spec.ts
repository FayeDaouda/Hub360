import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdministrationHubGuard } from './administration-hub.guard';

const ctxOf = (user: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

// Comptes, rôles et salaires : CIO et Administrateur HUB seuls (31/10/2026).
describe('AdministrationHubGuard', () => {
  it.each([
    ['CIO', { role: 'CIO (transverse)', fullAccess: true }],
    ['Administrateur HUB, quel que soit le rôle endossé', { role: 'Salarié', adminHub: true, fullAccess: true }],
  ])('AUTORISÉ : %s', (_l, user) => {
    expect(new AdministrationHubGuard().canActivate(ctxOf(user))).toBe(true);
  });

  it.each([['holding_admin'], ['societe_admin'], ['CEO (transverse)'], ['collaborateur']])(
    'REFUSÉ : %s → 403',
    (role) => {
      expect(() => new AdministrationHubGuard().canActivate(ctxOf({ role, fullAccess: false }))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('token absent → 403', () => {
    expect(() => new AdministrationHubGuard().canActivate(ctxOf(undefined))).toThrow(ForbiddenException);
  });
});
