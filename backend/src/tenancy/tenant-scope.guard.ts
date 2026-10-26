import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { declareScope } from './tenant-context';
import { GROUP_SCOPE, SYSTEM_SCOPE } from './tenant-scope.decorators';

// Garde global, exécuté avant ceux des contrôleurs : fixe le périmètre de la
// requête d'après la route (@GroupScope, @SystemScope). Ne refuse rien.
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<string>(SYSTEM_SCOPE, targets)) declareScope('system');
    else if (this.reflector.getAllAndOverride<boolean>(GROUP_SCOPE, targets)) declareScope('group');
    return true;
  }
}
