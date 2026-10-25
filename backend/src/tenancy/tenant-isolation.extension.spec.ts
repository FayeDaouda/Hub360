import { ForbiddenException } from '@nestjs/common';
import { currentTenant, runAsSystem, runInCompany, runInGroupScope } from './tenant-context';
import { companyOf, referencedIds, scopeArgsToCompany, TENANT_MODELS, TENANT_REFERENCES } from './tenant-isolation.extension';

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

describe('TENANT_REFERENCES', () => {
  it('liste les clés étrangères vers un modèle de société, y compris depuis un modèle enfant', () => {
    expect(TENANT_REFERENCES.get('Devis')).toContainEqual({ foreignKey: 'clientId', relation: 'client', target: 'Client' });
    expect(TENANT_REFERENCES.get('LigneDevis')).toContainEqual({ foreignKey: 'produitServiceId', relation: 'produitService', target: 'ProduitService' });
  });
});

describe('referencedIds', () => {
  it('relève les clés étrangères et les connect, par modèle cible', () => {
    const ids = referencedIds('Devis', 'create', { data: { societeId: A, clientId: 'c1', projet: { connect: { id: 'p1' } } } });
    expect(ids.get('Client')).toEqual(new Set(['c1']));
    expect(ids.get('Projet')).toEqual(new Set(['p1']));
  });

  it('upsert : la partie création et la partie mise à jour', () => {
    const ids = referencedIds('Devis', 'upsert', { where: { id: 'd' }, create: { clientId: 'c1' }, update: { clientId: 'c2' } });
    expect(ids.get('Client')).toEqual(new Set(['c1', 'c2']));
  });

  it('rien quand l’écriture ne référence rien', () => {
    expect(referencedIds('Devis', 'update', { where: { id: 'd' }, data: { objet: 'x' } }).size).toBe(0);
  });
});

describe('companyOf : refus par défaut', () => {
  it('sans contexte : erreur', () => {
    expect(() => companyOf(undefined, 'Facture.findMany')).toThrow('hors de tout contexte');
  });

  it('requête de société pas encore identifiée : erreur', () => {
    expect(() => companyOf({ scope: 'company' }, 'Facture.findMany')).toThrow('identifiée');
  });

  it('société identifiée : sa société ; groupe ou système déclarés : aucun filtre', () => {
    expect(companyOf({ scope: 'company', companyId: A }, 'x')).toBe(A);
    expect(companyOf({ scope: 'group', companyId: A }, 'x')).toBeNull();
    expect(companyOf({ scope: 'system', reason: 'test' }, 'x')).toBeNull();
  });
});

describe('contexte d’exécution', () => {
  it('hors requête : aucun contexte (refusé par l’extension)', () => {
    expect(currentTenant()).toBeUndefined();
  });

  it('runInGroupScope passe en périmètre groupe, sans changer de société, jusqu’à la fin du travail', async () => {
    await runInCompany(A, async () => {
      await Promise.resolve();
      expect(currentTenant()).toEqual({ scope: 'company', companyId: A });
      expect(await runInGroupScope(() => currentTenant())).toEqual({ scope: 'group', companyId: A });
      expect(currentTenant()).toEqual({ scope: 'company', companyId: A });
      // Travail asynchrone : le contexte tient jusqu'à sa résolution.
      const paresseux = { then: (resoudre: (v: unknown) => void) => resoudre(currentTenant()) };
      expect(await runInGroupScope(() => paresseux)).toEqual({ scope: 'group', companyId: A });
    });
  });

  it('runAsSystem est nommé', async () => {
    expect(await runAsSystem('tâche de test', () => currentTenant())).toEqual({ scope: 'system', reason: 'tâche de test' });
  });
});
