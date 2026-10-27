// Types de l'API tirés de sa description OpenAPI : `schema.d.ts` est généré
// depuis le back (`npm run api:types`, après `npm run openapi` au back) et ne
// se modifie jamais à la main ; la CI échoue s'il n'est plus à jour.
//
//   const corps: CorpsRequete<'/api/societes/{slug}/reglages/gabarits/{code}', 'put'> = { … };
//
// Les réponses ne sont typées que là où le back décrit un DTO de réponse
// (module par module, S1 à S7) : ailleurs, `ReponseApi` vaut `unknown`.
import type { components, paths } from './schema';

type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Route de l'API, chemin complet avec ses paramètres : « /api/societes/{slug}/… ». */
export type RouteApi = keyof paths;

/** Méthodes qu'une route accepte. */
export type MethodeDe<R extends RouteApi> = {
  [M in Methode]: paths[R][M] extends undefined | never ? never : M;
}[Methode];

type Operation<R extends RouteApi, M extends MethodeDe<R>> = NonNullable<paths[R][M]>;

/** Paramètres de chemin d'une route : `{ slug: string; code: string }`. */
export type ParametresChemin<R extends RouteApi, M extends MethodeDe<R>> =
  Operation<R, M> extends { parameters: { path: infer P } } ? P : never;

/** Corps JSON attendu par une route. */
export type CorpsRequete<R extends RouteApi, M extends MethodeDe<R>> =
  Operation<R, M> extends { requestBody?: { content: { 'application/json': infer C } } } ? C : never;

/** Réponse JSON d'une route : `unknown` tant que le back ne la décrit pas. */
export type ReponseApi<R extends RouteApi, M extends MethodeDe<R>> =
  Operation<R, M> extends { responses: { 200: { content: { 'application/json': infer C } } } }
    ? C
    : Operation<R, M> extends { responses: { 201: { content: { 'application/json': infer C } } } }
      ? C
      : unknown;

/** Schéma d'un DTO du back, par son nom de classe : `SchemaApi<'GabaritDto'>`. */
export type SchemaApi<N extends keyof components['schemas']> = components['schemas'][N];
