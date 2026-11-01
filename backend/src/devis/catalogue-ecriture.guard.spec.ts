import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CatalogueEcritureGuard } from './catalogue-ecriture.guard';

const ctx = (permissions: Record<string, string>, societeSlug = 'grey', method = 'POST') =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, user: { permissions, societeSlug }, params: { slug: 'grey' } }),
    }),
  }) as unknown as ExecutionContext;

// Écriture de l'étape « Catalogue » (matrice, 31/10/2026 ; au départ le CEO
// et l'administration).
describe('CatalogueEcritureGuard', () => {
  it('Écriture du catalogue, sur la société de son jeton → autorisé', () => {
    expect(new CatalogueEcritureGuard().canActivate(ctx({ 'finances.catalogue': 'LE' }))).toBe(true);
  });

  it.each([[{ 'finances.catalogue': 'L' }], [{ finances_devis: 'LEVS' }], [{}]])('sans l’Écriture → 403', (p) => {
    expect(() => new CatalogueEcritureGuard().canActivate(ctx(p))).toThrow(ForbiddenException);
  });

  it('connecté sur une autre société → 403', () => {
    expect(() => new CatalogueEcritureGuard().canActivate(ctx({ 'finances.catalogue': 'LE' }, 'autre'))).toThrow(
      ForbiddenException,
    );
  });
});

it('retirer une prestation demande la Suppression du catalogue', () => {
  expect(() => new CatalogueEcritureGuard().canActivate(ctx({ 'finances.catalogue': 'LE' }, 'grey', 'DELETE'))).toThrow(
    ForbiddenException,
  );
  expect(new CatalogueEcritureGuard().canActivate(ctx({ 'finances.catalogue': 'LES' }, 'grey', 'DELETE'))).toBe(true);
});
