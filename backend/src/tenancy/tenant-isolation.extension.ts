import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentTenant, TenantContext } from './tenant-context';

// Isolation entre sociétés appliquée à un seul endroit (ADR 0001) :
// - toute opération sur un modèle qui porte un `societeId` obligatoire est
//   limitée à la société de l'opération ;
// - une écriture ne peut pas référencer (clé étrangère, `connect`) une donnée
//   d'une autre société, quel que soit le modèle écrit ;
// - sans contexte, ou sans société identifiée, ces opérations sont refusées ;
// - les requêtes SQL brutes, qui échappent au filtre, ne passent qu'en
//   périmètre système déclaré.
// Listes lues dans le schéma : un nouveau modèle est couvert sans rien maintenir.

const MODELS = Prisma.dmmf.datamodel.models;

export const TENANT_MODELS: ReadonlySet<string> = new Set(
  MODELS.filter((m) => m.fields.some((f) => f.name === 'societeId' && f.isRequired)).map((m) => m.name),
);

// Pour chaque modèle, ses clés étrangères vers un modèle de société.
type Reference = { foreignKey: string; relation: string; target: string };
export const TENANT_REFERENCES: ReadonlyMap<string, readonly Reference[]> = new Map(
  MODELS.map((m) => [
    m.name,
    m.fields
      .filter((f) => f.kind === 'object' && TENANT_MODELS.has(f.type) && f.relationFromFields?.length === 1)
      .map((f) => ({ foreignKey: f.relationFromFields![0], relation: f.name, target: f.type })),
  ]),
);

const FILTERED_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert']);

type Args = {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: unknown;
  update?: unknown;
  [key: string]: unknown;
};
type Row = Record<string, unknown> | undefined;

function targetCompanyOf(row: unknown): unknown {
  const data = row as { societeId?: unknown; societe?: { connect?: { id?: unknown } } } | undefined;
  return data?.societeId ?? data?.societe?.connect?.id;
}

const writtenRows = (operation: string, args: Args): Row[] =>
  (operation === 'upsert' ? [args.create, args.update] : Array.isArray(args.data) ? args.data : [args.data]) as Row[];

// Arguments de l'opération une fois limités à `companyId`. Une création pour
// une autre société est refusée plutôt que réécrite : c'est un bug, pas un cas.
export function scopeArgsToCompany(operation: string, args: Args, companyId: string): Args {
  const scoped: Args = { ...args };
  if (FILTERED_OPERATIONS.has(operation)) {
    // Ajouté au niveau du `where` lui-même : Prisma accepte un champ non
    // unique à côté de l'identifiant pour findUnique, update et delete.
    scoped.where = { ...args.where, societeId: companyId };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    const rows = operation === 'upsert' ? [args.create] : Array.isArray(args.data) ? args.data : [args.data];
    if (rows.some((row) => targetCompanyOf(row) !== undefined && targetCompanyOf(row) !== companyId)) {
      throw new ForbiddenException('Écriture refusée : la donnée appartient à une autre société.');
    }
  }
  return scoped;
}

// Identifiants référencés par une écriture, par modèle cible : clé étrangère
// renseignée directement, ou `connect: { id }` sur la relation.
export function referencedIds(model: string, operation: string, args: Args): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const row of writtenRows(operation, args)) {
    if (!row) continue;
    for (const { foreignKey, relation, target } of TENANT_REFERENCES.get(model) ?? []) {
      const connect = (row[relation] as { connect?: { id?: unknown } } | undefined)?.connect;
      for (const value of [row[foreignKey], connect?.id]) {
        if (typeof value === 'string') found.set(target, (found.get(target) ?? new Set()).add(value));
      }
    }
  }
  return found;
}

// Société de l'opération, ou null en périmètre groupe ou système. Refus par
// défaut : pas de contexte, ou requête de société pas encore identifiée.
export function companyOf(tenant: TenantContext | undefined, what: string): string | null {
  if (!tenant) {
    throw new Error(
      `${what} hors de tout contexte d'isolation : déclarer runInCompany, runInGroupScope ou runAsSystem (ADR 0001).`,
    );
  }
  if (tenant.scope !== 'company') return null;
  if (!tenant.companyId) throw new Error(`${what} avant que la société de la requête soit identifiée (ADR 0001).`);
  return tenant.companyId;
}

const delegateOf = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

type RawOperation = { args: unknown; query: (args: unknown) => Promise<unknown> };

function refuseRawOutsideSystem({ args, query }: RawOperation): Promise<unknown> {
  if (currentTenant()?.scope !== 'system') {
    throw new Error('Requête SQL brute refusée hors runAsSystem : elle échappe au filtre par société (ADR 0001).');
  }
  return query(args);
}

export const tenantIsolation = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isTenantModel = TENANT_MODELS.has(model);
          const references = WRITE_OPERATIONS.has(operation)
            ? referencedIds(model, operation, args as Args)
            : new Map<string, Set<string>>();
          if (!isTenantModel && references.size === 0) return query(args);

          const companyId = companyOf(currentTenant(), `${model}.${operation}`);
          if (companyId === null) return query(args);

          // Le client d'origine, sans cette extension, cherche les cibles qui
          // appartiennent à une AUTRE société. On ne compte pas celles de la
          // société active : une cible créée plus tôt dans la même transaction
          // n'est pas encore visible depuis une autre connexion, alors que les
          // données des autres sociétés, elles, sont validées et visibles.
          for (const [target, ids] of references) {
            const delegate = (client as unknown as Record<string, { count(a: object): Promise<number> }>)[
              delegateOf(target)
            ];
            const etrangeres = await delegate.count({ where: { id: { in: [...ids] }, societeId: { not: companyId } } });
            if (etrangeres > 0) {
              throw new ForbiddenException('Écriture refusée : elle référence une donnée d’une autre société.');
            }
          }
          if (!isTenantModel) return query(args);
          return query(scopeArgsToCompany(operation, args as Args, companyId) as typeof args);
        },
      },
      $queryRaw: refuseRawOutsideSystem,
      $executeRaw: refuseRawOutsideSystem,
      $queryRawUnsafe: refuseRawOutsideSystem,
      $executeRawUnsafe: refuseRawOutsideSystem,
    },
  }),
);
