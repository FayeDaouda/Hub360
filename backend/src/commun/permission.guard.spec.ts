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

// @PermissionSelonMethode (contrôleurs Projets) : lecture en GET, écriture
// sinon ; exemption EXPLICITE d'un rôle hors matrice (collaborateur) ; une
// règle de route (@RequiertPermission, ex. finances) reste prioritaire.
describe('PermissionGuard — règle selon la méthode', () => {
  const SELON = { module: 'projets', roleHorsMatrice: 'collaborateur' };
  const parCle = (valeurs: Record<string, unknown>): Reflector =>
    ({ getAllAndOverride: jest.fn((cle: string) => valeurs[cle]) }) as unknown as Reflector;
  const requete = (method: string, role: string, permissions?: Record<string, string>) => ({
    method,
    user: { role, permissions },
  });
  const g = (valeurs: Record<string, unknown>) => new PermissionGuard(parCle(valeurs));

  it('GET avec projets:lecture → autorisé', () => {
    expect(g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete('GET', 'COO', { projets: 'lecture' })))).toBe(true);
  });

  it.each([['POST'], ['PATCH'], ['PUT'], ['DELETE']])('%s avec projets:lecture seulement → 403', (m) => {
    expect(() =>
      g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete(m, 'COO', { projets: 'lecture' }))),
    ).toThrow(ForbiddenException);
  });

  it('PATCH avec projets:ecriture → autorisé ; validation couvre écriture', () => {
    expect(g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete('PATCH', 'Dir. GC', { projets: 'ecriture' })))).toBe(true);
    expect(g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete('PATCH', 'CTO (transverse)', { projets: 'validation' })))).toBe(true);
  });

  it('GET sans aucune ligne projets (RH, CIO) → 403', () => {
    expect(() =>
      g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete('GET', 'RH', { rh: 'ecriture' }))),
    ).toThrow(ForbiddenException);
  });

  it('collaborateur exempté SUR CES ROUTES (cellule gérée par AccesProjetGuard), même en écriture', () => {
    expect(g({ permissionSelonMethode: SELON }).canActivate(ctxOf(requete('PATCH', 'collaborateur', {})))).toBe(true);
  });

  it('pas d’exemption sans roleHorsMatrice déclaré : collaborateur refusé', () => {
    expect(() =>
      g({ permissionSelonMethode: { module: 'projets' } }).canActivate(ctxOf(requete('GET', 'collaborateur', {}))),
    ).toThrow(ForbiddenException);
  });

  it('une règle de route (finances) prime et ne connaît pas l’exemption : collaborateur refusé sur le pré-bilan', () => {
    expect(() =>
      g({
        permissionRequise: { module: 'finances_marges', niveau: 'lecture' },
        permissionSelonMethode: SELON,
      }).canActivate(ctxOf(requete('GET', 'collaborateur', {}))),
    ).toThrow(ForbiddenException);
  });
});
