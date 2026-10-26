import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LectureLocalitesGuard } from './lecture-localites.guard';

function ctx(user: object) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params: { slug: 'gc' } }) }),
  } as unknown as ExecutionContext;
}

describe('LectureLocalitesGuard', () => {
  const guard = new LectureLocalitesGuard();

  it('societe_admin / CIO → oui (gestion du référentiel)', () => {
    expect(guard.canActivate(ctx({ role: 'societe_admin', societeSlug: 'gc' }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'CIO (transverse)', societeSlug: 'gc' }))).toBe(true);
  });

  it('rôle de direction avec crm ≥ lecture → oui', () => {
    expect(guard.canActivate(ctx({ role: 'COO', societeSlug: 'gc', permissions: { crm: 'ecriture' } }))).toBe(true);
  });

  it('rôle de direction sans crm → 403', () => {
    expect(() => guard.canActivate(ctx({ role: 'RH', societeSlug: 'gc', permissions: { crm: 'aucun' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('collaborateur → 403', () => {
    expect(() => guard.canActivate(ctx({ role: 'collaborateur', societeSlug: 'gc', permissions: {} }))).toThrow(
      ForbiddenException,
    );
  });
});
