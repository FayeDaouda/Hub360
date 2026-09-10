import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Prisma renvoie les Decimal comme objets decimal.js (sérialisés en chaîne
// par défaut). Le front attend des `number` pour les montants FCFA (qui
// tiennent largement dans un number JS). On convertit en profondeur.
function normaliser(valeur: unknown): unknown {
  if (valeur == null) return valeur;
  if (Prisma.Decimal.isDecimal(valeur)) return (valeur as Prisma.Decimal).toNumber();
  if (valeur instanceof Date) return valeur.toISOString();
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (typeof valeur === 'object') {
    const sortie: Record<string, unknown> = {};
    for (const cle of Object.keys(valeur as Record<string, unknown>)) {
      sortie[cle] = normaliser((valeur as Record<string, unknown>)[cle]);
    }
    return sortie;
  }
  return valeur;
}

@Injectable()
export class SerialisationInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(normaliser));
  }
}
