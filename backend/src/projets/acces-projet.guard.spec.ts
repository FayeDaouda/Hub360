import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccesProjetGuard } from './acces-projet.guard';

const ctxOf = (role: string, societeSlug = 'grey') =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { role, societeSlug }, params: { slug: 'grey', id: 'P1' } }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

const reflector = (marque: unknown): Reflector =>
  ({ getAllAndOverride: jest.fn().mockReturnValue(marque) }) as unknown as Reflector;
const REQUIS = { module: 'finances_factures', niveau: 'lecture' };

describe('AccesProjetGuard', () => {
  it('jeton d’une autre société → 403', () => {
    expect(() => new AccesProjetGuard(reflector(REQUIS)).canActivate(ctxOf('CFO', 'autre'))).toThrow(ForbiddenException);
  });
  it('compte de secours (societe_admin) → autorisé', () => {
    expect(new AccesProjetGuard(reflector(undefined)).canActivate(ctxOf('societe_admin'))).toBe(true);
  });
  it('Salarié → 403, même sur un endpoint marqué', () => {
    expect(() => new AccesProjetGuard(reflector(REQUIS)).canActivate(ctxOf('Salarié'))).toThrow(ForbiddenException);
  });
  it('rôle de la matrice sur un endpoint marqué → laissé à PermissionGuard', () => {
    expect(new AccesProjetGuard(reflector(REQUIS)).canActivate(ctxOf('CFO'))).toBe(true);
  });
  it('rôle de la matrice sur un endpoint non marqué → 403', () => {
    expect(() => new AccesProjetGuard(reflector(undefined)).canActivate(ctxOf('CFO'))).toThrow(ForbiddenException);
  });
});
