import { AsyncLocalStorage } from 'async_hooks';

// Contexte d'isolation de l'opération en cours (ADR 0001).
// - `company` : chaque requête Prisma est limitée à `companyId` ; tant que la
//   société n'est pas identifiée (authentification en cours), les données de
//   société sont refusées.
// - `group` : lecture transverse assumée (module RH, espace /groupe).
// - `system` : traitement sans session de société, déclaré et nommé (tâches
//   planifiées, connexion, recherche d'un lien public par son jeton).
// Sans contexte du tout, les données de société sont refusées : c'est le
// refus par défaut.
export type TenantScope = 'company' | 'group' | 'system';
export type TenantContext = { scope: TenantScope; companyId?: string; reason?: string };

const storage = new AsyncLocalStorage<TenantContext>();

export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

// Ouvre le contexte d'une requête HTTP (TenantContextMiddleware) : périmètre
// société, société encore inconnue. L'authentification la renseigne ensuite.
export function runInRequestContext<T>(work: () => T): T {
  return storage.run({ scope: 'company' }, work);
}

// Renseigne la société de la requête en cours, une fois l'appelant authentifié
// (jeton de session, ticket du chat, jeton d'un lien public).
export function identifyCompany(companyId: string): void {
  const context = storage.getStore();
  if (context) context.companyId = companyId;
}

// Fixe le périmètre de la requête en cours d'après sa route (TenantScopeGuard).
export function declareScope(scope: TenantScope): void {
  const context = storage.getStore();
  if (context) context.scope = scope;
}

// Le travail est attendu DANS le contexte : une requête Prisma ne s'exécute
// qu'à son `await`, qui sinon aurait lieu après la sortie du contexte.
function runWith<T>(context: TenantContext, work: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(context, async () => await work());
}

export function runInCompany<T>(companyId: string, work: () => T | PromiseLike<T>): Promise<T> {
  return runWith({ scope: 'company', companyId }, work);
}

// Lecture transverse ponctuelle à l'intérieur d'une requête de société
// (ex. la recherche globale, qui interroge aussi les dossiers du personnel).
export function runInGroupScope<T>(work: () => T | PromiseLike<T>): Promise<T> {
  return runWith({ ...currentTenant(), scope: 'group' }, work);
}

// Traitement hors société, nommé pour les journaux d'erreur : tâches
// planifiées, recherche d'un lien public par son jeton.
export function runAsSystem<T>(reason: string, work: () => T | PromiseLike<T>): Promise<T> {
  return runWith({ scope: 'system', reason }, work);
}
