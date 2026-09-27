import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MembreSocieteGuard } from './membre-societe.guard';

// Garde la plus permissive du back-office : n'importe quel membre de LA
// société (admin ou collaborateur) passe, tant que le token a été émis pour
// ce slug. Un seul axe à couvrir : hors périmètre (autre société / pas de
// token) vs autorisé, quel que soit le rôle.

type User = { societeSlug: string | null; role: string };

const ctxOf = (req: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const req = (o: Partial<{ user: User; params: { slug: string } }> = {}) => ({
  user: { societeSlug: 'grey', role: 'collaborateur' } as User,
  params: { slug: 'grey' },
  ...o,
});

describe('MembreSocieteGuard', () => {
  it('AUTORISÉ : collaborateur du bon slug', () => {
    expect(new MembreSocieteGuard().canActivate(ctxOf(req()))).toBe(true);
  });

  it('AUTORISÉ : societe_admin du bon slug (aucun rôle exigé)', () => {
    expect(
      new MembreSocieteGuard().canActivate(
        ctxOf(req({ user: { societeSlug: 'grey', role: 'societe_admin' } })),
      ),
    ).toBe(true);
  });

  it('HORS PÉRIMÈTRE : token émis pour une autre société → 403', () => {
    expect(() =>
      new MembreSocieteGuard().canActivate(
        ctxOf(req({ user: { societeSlug: 'autre', role: 'collaborateur' } })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('token absent → 403', () => {
    expect(() =>
      new MembreSocieteGuard().canActivate(ctxOf(req({ user: undefined }))),
    ).toThrow(ForbiddenException);
  });
});
