import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CatalogueEcritureGuard } from './catalogue-ecriture.guard';

const ctx = (role: string, societeSlug = 'grey') =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { role, societeSlug }, params: { slug: 'grey' } }) }),
  }) as unknown as ExecutionContext;

describe('CatalogueEcritureGuard', () => {
  it.each([['CEO (transverse)'], ['societe_admin']])('%s de la société → autorisé', (role) => {
    expect(new CatalogueEcritureGuard().canActivate(ctx(role))).toBe(true);
  });

  it.each([['CFO'], ['CIO (transverse)'], ['Dir. GC'], ['Salarié']])('%s → 403', (role) => {
    expect(() => new CatalogueEcritureGuard().canActivate(ctx(role))).toThrow(ForbiddenException);
  });

  it('CEO connecté sur une autre société → 403', () => {
    expect(() => new CatalogueEcritureGuard().canActivate(ctx('CEO (transverse)', 'autre'))).toThrow(
      ForbiddenException,
    );
  });
});
