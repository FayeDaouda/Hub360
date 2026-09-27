import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import type { PermissionRequise } from './permission.decorator';

// PermissionGuard est opt-in par route (@RequiertPermission) : on teste
// l'absence de décorateur (laisse passer), l'ordre total des niveaux
// (validation ⊇ ecriture ⊇ lecture ⊇ aucun), et l'absence d'entrée pour le
// module (fail closed, traité comme 'aucun').

type User = { permissions?: Record<string, string> };

const ctxOf = (req: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => {},
    getClass: () => class {},
  }) as unknown as ExecutionContext;

const req = (permissions?: Record<string, string>) => ({ user: { permissions } as User });

const reflector = (requis: PermissionRequise | undefined): Reflector =>
  ({ getAllAndOverride: jest.fn().mockReturnValue(requis) }) as unknown as Reflector;

describe('PermissionGuard', () => {
  it('pas de @RequiertPermission sur la route → laisse passer', () => {
    const guard = new PermissionGuard(reflector(undefined));
    expect(guard.canActivate(ctxOf(req({})))).toBe(true);
  });

  it('AUTORISÉ : niveau exact requis', () => {
    const guard = new PermissionGuard(reflector({ module: 'crm', niveau: 'ecriture' }));
    expect(guard.canActivate(ctxOf(req({ crm: 'ecriture' })))).toBe(true);
  });

  it('AUTORISÉ : niveau supérieur au requis (validation couvre ecriture)', () => {
    const guard = new PermissionGuard(reflector({ module: 'finances_devis', niveau: 'ecriture' }));
    expect(guard.canActivate(ctxOf(req({ finances_devis: 'validation' })))).toBe(true);
  });

  it('REFUSÉ : niveau inférieur au requis (lecture ne couvre pas ecriture) → 403', () => {
    const guard = new PermissionGuard(reflector({ module: 'crm', niveau: 'ecriture' }));
    expect(() => guard.canActivate(ctxOf(req({ crm: 'lecture' })))).toThrow(ForbiddenException);
  });

  it("REFUSÉ : aucune entrée pour le module (fail closed) → 403", () => {
    const guard = new PermissionGuard(reflector({ module: 'rh', niveau: 'lecture' }));
    expect(() => guard.canActivate(ctxOf(req({ crm: 'validation' })))).toThrow(ForbiddenException);
  });

  it('REFUSÉ : permissions absentes (token émis avant ce champ) → 403', () => {
    const guard = new PermissionGuard(reflector({ module: 'crm', niveau: 'lecture' }));
    expect(() => guard.canActivate(ctxOf(req(undefined)))).toThrow(ForbiddenException);
  });
});
