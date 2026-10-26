import { Injectable, NestMiddleware } from '@nestjs/common';
import { runInRequestContext } from './tenant-context';

// Ouvre le contexte d'isolation de chaque requête HTTP, avant les gardes :
// tout ce que la requête exécute ensuite (gardes, handler, transactions) en
// hérite. La société est renseignée par l'authentification (ADR 0001).
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    runInRequestContext(next);
  }
}
