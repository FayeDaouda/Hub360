import { AsyncLocalStorage } from 'async_hooks';

// Société active de la requête en cours (ADR 0001). `company` : chaque
// requête Prisma est limitée à cette société ; `group` : lecture transverse
// assumée (module RH, recherche de salariés, espace /groupe).
export type TenantScope = 'company' | 'group';
export type TenantContext = { companyId: string; scope: TenantScope };

const storage = new AsyncLocalStorage<TenantContext>();

// Contexte courant, ou undefined hors requête de société (tâches planifiées,
// scripts, seed, liens publics) : aucun filtre ne s'applique alors.
export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

export function runInTenant<T>(context: TenantContext, work: () => T): T {
  return storage.run(context, work);
}

// Lecture transverse ponctuelle à l'intérieur d'une requête de société
// (ex. la recherche globale, qui interroge aussi les dossiers du personnel).
// Le travail est attendu DANS le contexte : une requête Prisma ne s'exécute
// qu'à son `await`, qui sinon aurait lieu après la sortie du périmètre groupe.
export function runInGroupScope<T>(work: () => T | PromiseLike<T>): Promise<T> {
  const context = currentTenant();
  const attendre = async () => await work();
  return context ? storage.run({ ...context, scope: 'group' }, attendre) : attendre();
}
