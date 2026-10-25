import { ForbiddenException } from '@nestjs/common';
import { currentTenant, runInGroupScope, runInTenant } from './tenant-context';
import { scopeArgsToCompany, TENANT_MODELS } from './tenant-isolation.extension';

const A = 'societe-a';
const B = 'societe-b';

describe('TENANT_MODELS', () => {
  it('lit dans le schéma les modèles à societeId obligatoire', () => {
    expect(TENANT_MODELS.has('Facture')).toBe(true);
    expect(TENANT_MODELS.has('DossierCrm')).toBe(true);
    expect(TENANT_MODELS.has('DossierPersonnel')).toBe(true);
  });

  it('exclut les modèles sans société ou à société facultative (rôles du socle)', () => {
    for (const model of ['Utilisateur', 'Societe', 'LigneFacture', 'TacheProjet', 'Role', 'UtilisateurSocieteRole']) {
      expect(TENANT_MODELS.has(model)).toBe(false);
    }
  });
});

describe('scopeArgsToCompany', () => {
  it.each(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'])('%s : la société active est ajoutée au filtre', (operation) => {
    expect(scopeArgsToCompany(operation, { where: { statut: 'emise' } }, A).where).toEqual({ statut: 'emise', societeId: A });
  });

  it.each(['findUnique', 'findUniqueOrThrow', 'update', 'delete'])('%s par id : la société active s’ajoute à côté de l’identifiant', (operation) => {
    expect(scopeArgsToCompany(operation, { where: { id: 'x' } }, A).where).toEqual({ id: 'x', societeId: A });
  });

  it('un filtre sur une autre société est remplacé par la société active', () => {
    expect(scopeArgsToCompany('findMany', { where: { societeId: B } }, A).where).toEqual({ societeId: A });
  });

  it('sans where, le filtre est créé', () => {
    expect(scopeArgsToCompany('findMany', {}, A).where).toEqual({ societeId: A });
  });

  it('les arguments d’origine ne sont pas modifiés', () => {
    const args = { where: { id: 'x' } };
    scopeArgsToCompany('findUnique', args, A);
    expect(args.where).toEqual({ id: 'x' });
  });

  it.each([
    ['create', { data: { societeId: A, nom: 'x' } }],
    ['create', { data: { societe: { connect: { id: A } } } }],
    ['createMany', { data: [{ societeId: A }, { societeId: A }] }],
    ['upsert', { where: { id: 'x' }, create: { societeId: A }, update: {} }],
  ])('ACCEPTÉ : %s pour la société active', (operation, args) => {
    expect(() => scopeArgsToCompany(operation, args, A)).not.toThrow();
  });

  it.each([
    ['create', { data: { societeId: B } }],
    ['create', { data: { societe: { connect: { id: B } } } }],
    ['createMany', { data: [{ societeId: A }, { societeId: B }] }],
    ['upsert', { where: { id: 'x' }, create: { societeId: B }, update: {} }],
  ])('REFUSÉ : %s pour une autre société', (operation, args) => {
    expect(() => scopeArgsToCompany(operation, args, A)).toThrow(ForbiddenException);
  });

  it('upsert : filtré ET contrôlé', () => {
    expect(scopeArgsToCompany('upsert', { where: { id: 'x' }, create: { societeId: A }, update: {} }, A).where).toEqual({ id: 'x', societeId: A });
  });
});

describe('contexte de requête', () => {
  it('hors requête : aucun contexte (tâches planifiées, scripts, liens publics)', () => {
    expect(currentTenant()).toBeUndefined();
  });

  it('runInGroupScope passe en périmètre groupe, sans changer de société, jusqu’à la fin du travail', async () => {
    await runInTenant({ companyId: A, scope: 'company' }, async () => {
      await Promise.resolve();
      expect(currentTenant()).toEqual({ companyId: A, scope: 'company' });
      expect(await runInGroupScope(() => currentTenant())).toEqual({ companyId: A, scope: 'group' });
      expect(currentTenant()).toEqual({ companyId: A, scope: 'company' });
      // Travail asynchrone : le contexte groupe tient jusqu'à sa résolution.
      const paresseux = { then: (resoudre: (v: unknown) => void) => resoudre(currentTenant()) };
      expect(await runInGroupScope(() => paresseux)).toEqual({ companyId: A, scope: 'group' });
    });
  });
});
