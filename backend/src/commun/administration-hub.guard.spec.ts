import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdministrationHubGuard } from './administration-hub.guard';
import { ROLE_CIO } from '@hub/domain';

const ctxOf = (user: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('AdministrationHubGuard', () => {
  it.each([[ROLE_CIO], ['holding_admin']])('AUTORISÉ : %s', (role) => {
    expect(new AdministrationHubGuard().canActivate(ctxOf({ role }))).toBe(true);
  });

  it.each([['societe_admin'], ['CEO (transverse)'], ['collaborateur']])('REFUSÉ : %s → 403', (role) => {
    expect(() => new AdministrationHubGuard().canActivate(ctxOf({ role }))).toThrow(ForbiddenException);
  });

  it('token absent → 403', () => {
    expect(() => new AdministrationHubGuard().canActivate(ctxOf(undefined))).toThrow(ForbiddenException);
  });
});
