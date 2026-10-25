import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { GROUP_SCOPE } from './group-scope.decorator';
import { runInTenant, TenantContext } from './tenant-context';

// Intercepteur global : après l'authentification, la société du jeton devient
// la société active pour toute l'exécution du handler, transactions comprises
// (ADR 0001). Les gardes, qui s'exécutent avant, vérifient déjà la société
// elles-mêmes.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenant = this.tenantOf(context);
    if (!tenant) return next.handle();
    return new Observable((subscriber) => runInTenant(tenant, () => next.handle().subscribe(subscriber)));
  }

  private tenantOf(context: ExecutionContext): TenantContext | undefined {
    if (context.getType() !== 'http') return undefined;
    const companyId: unknown = context.switchToHttp().getRequest().user?.societeId;
    if (typeof companyId !== 'string' || !companyId) return undefined;
    const groupScope = this.reflector.getAllAndOverride<boolean>(GROUP_SCOPE, [context.getHandler(), context.getClass()]);
    return { companyId, scope: groupScope ? 'group' : 'company' };
  }
}
