import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ROLE_CFO, ROLE_CIO, ROLE_DIR_GC } from '@hub/domain';
import { ParametresContratGuard } from './parametres-contrat.guard';

// Réglages des contrats : administration, CIO ou Dir. GC — toujours sur la
// société de l'URL.
const ctxOf = (role: string, societeSlug = 'grey'): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { societeSlug, role }, params: { slug: 'grey' } }) }),
  }) as unknown as ExecutionContext;

describe('ParametresContratGuard', () => {
  it('AUTORISÉ : Dir. GC de la société', () => {
    expect(new ParametresContratGuard().canActivate(ctxOf(ROLE_DIR_GC))).toBe(true);
  });

  it('AUTORISÉ : CIO, comme avant', () => {
    expect(new ParametresContratGuard().canActivate(ctxOf(ROLE_CIO))).toBe(true);
  });

  it('REFUSÉ : Dir. GC dont le jeton porte une AUTRE société → 403', () => {
    expect(() => new ParametresContratGuard().canActivate(ctxOf(ROLE_DIR_GC, 'autre'))).toThrow(ForbiddenException);
  });

  it('REFUSÉ : un autre rôle (CFO) → 403', () => {
    expect(() => new ParametresContratGuard().canActivate(ctxOf(ROLE_CFO))).toThrow(ForbiddenException);
  });
});
