import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { ParameterObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// Toutes les routes sont servies sous /api (main.ts).
export const PREFIXE_API = 'api';

// Description OpenAPI de l'API, tirée du code : routes des contrôleurs et
// DTO (plugin @nestjs/swagger de nest-cli.json, qui lit les décorateurs de
// class-validator des fichiers *dto.ts). Les réponses ne sont décrites que
// là où un DTO de réponse existe : ajoutées module par module (S1 à S7).
export function documentOpenApi(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder().setTitle('HUB API').setVersion('1').addBearerAuth().build();
  return completer(SwaggerModule.createDocument(app, configuration));
}

const METHODES = ['get', 'post', 'put', 'patch', 'delete'] as const;

// Trois compléments à ce que le plugin tire du code :
// - chaque paramètre de chemin ({slug}, {id}…) est déclaré sur chaque route,
//   dans l'ordre du chemin : le plugin ne voit que ceux que la méthode lit
//   (@Param), pas ceux déclarés par le contrôleur ;
// - une réponse « objet » sans propriétés est un type deviné, pas une
//   description : elle devient « inconnue » plutôt qu'un objet vide ;
// - les listes de valeurs permises (enum) sont triées : celles que le plugin
//   tire d'une union de types TypeScript suivent l'ordre de lecture des
//   fichiers, qui diffère d'une machine à l'autre (macOS, CI sous Linux).
function completer(document: OpenAPIObject): OpenAPIObject {
  for (const [chemin, route] of Object.entries(document.paths)) {
    const noms = [...chemin.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const methode of METHODES) {
      const operation = route[methode];
      if (!operation) continue;
      const parametres = (operation.parameters ?? []) as ParameterObject[];
      const duChemin = noms.map(
        (nom): ParameterObject =>
          parametres.find((p) => p.in === 'path' && p.name === nom) ?? {
            name: nom,
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
      );
      operation.parameters = [...duChemin, ...parametres.filter((p) => p.in !== 'path')];
      for (const reponse of Object.values(operation.responses ?? {})) {
        const contenu = reponse && 'content' in reponse ? reponse.content?.['application/json'] : undefined;
        if (contenu?.schema) contenu.schema = sansObjetDevine(contenu.schema as SchemaObject);
      }
    }
  }
  trierEnums(document);
  return document;
}

function trierEnums(noeud: unknown): void {
  if (Array.isArray(noeud)) {
    noeud.forEach(trierEnums);
  } else if (noeud && typeof noeud === 'object') {
    for (const [cle, valeur] of Object.entries(noeud)) {
      if (cle === 'enum' && Array.isArray(valeur) && valeur.every((v) => typeof v === 'string')) {
        valeur.sort();
      } else {
        trierEnums(valeur);
      }
    }
  }
}

const objetDevine = (s: SchemaObject) => s.type === 'object' && !s.properties && !s.additionalProperties;

function sansObjetDevine(schema: SchemaObject): SchemaObject {
  if (objetDevine(schema)) return {};
  if (schema.type === 'array' && schema.items && objetDevine(schema.items as SchemaObject)) {
    return { ...schema, items: {} };
  }
  return schema;
}
