import { describe, expectTypeOf, it } from 'vitest';
import type { CorpsRequete, MethodeDe, ParametresChemin, ReponseApi, SchemaApi } from './types';

// Vérifiés par `npm run typecheck` (tsc) : les types d'aide lisent bien la
// description générée depuis le back.
type Gabarit = '/api/societes/{slug}/reglages/gabarits/{code}';

describe('types de l’API', () => {
  it('méthodes, paramètres de chemin et corps d’une route', () => {
    expectTypeOf<MethodeDe<Gabarit>>().toEqualTypeOf<'put'>();
    expectTypeOf<ParametresChemin<Gabarit, 'put'>>().toEqualTypeOf<{ slug: string; code: string }>();
    expectTypeOf<CorpsRequete<Gabarit, 'put'>>().toEqualTypeOf<SchemaApi<'GabaritDto'>>();
  });

  it('réponse non décrite par le back : inconnue, pas un objet vide', () => {
    expectTypeOf<ReponseApi<Gabarit, 'put'>>().toEqualTypeOf<unknown>();
  });
});
