import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentTenant } from './tenant-context';

// Isolation entre sociétés appliquée à un seul endroit (ADR 0001) : toute
// opération sur un modèle qui porte un `societeId` obligatoire est limitée à
// la société active de la requête. Liste lue dans le schéma : un nouveau
// modèle de société est couvert sans rien maintenir.
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'societeId' && f.isRequired)).map((m) => m.name),
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

type Args = { where?: Record<string, unknown>; data?: unknown; create?: unknown; [key: string]: unknown };

function targetCompanyOf(row: unknown): unknown {
  const data = row as { societeId?: unknown; societe?: { connect?: { id?: unknown } } } | undefined;
  return data?.societeId ?? data?.societe?.connect?.id;
}

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

export const tenantIsolation = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const tenant = currentTenant();
        if (!tenant || tenant.scope !== 'company' || !TENANT_MODELS.has(model)) return query(args);
        return query(scopeArgsToCompany(operation, args as Args, tenant.companyId) as typeof args);
      },
    },
  },
});
