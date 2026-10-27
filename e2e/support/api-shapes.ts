import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Filet de sécurité de l'API (structuration) : pendant les captures, la forme
// de chaque réponse JSON réussie (chemins des clés et types des valeurs) est
// relevée, route par route. `npm run validate` relève celle de `main` avec la
// référence, puis celle de la branche, et échoue si une clé disparaît ou
// change de type (scripts/api-shapes.mjs). Actif seulement quand
// HUB_API_SHAPES_DIR désigne le dossier du relevé.

const OUTPUT_DIR = process.env.HUB_API_SHAPES_DIR;
// Entrées déjà écrites par ce processus : chaque ligne une seule fois.
const written = new Set<string>();

// Route sans ses valeurs : identifiants, société, jetons, dates et nombres
// deviennent des paramètres (« GET /api/societes/:slug/projets/:id »).
export function routeKey(method: string, url: string): string {
  const path = new URL(url).pathname
    .split('/')
    .map((segment, i, all) => {
      if (!segment) return segment;
      if (all[i - 1] === 'societes') return ':slug';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ':id';
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(segment)) return ':date';
      if (/^\d+$/.test(segment)) return ':n';
      // Jeton : long, avec au moins un chiffre ou une majuscule (pas un mot).
      if (/^(?=.*[A-Z0-9_])[A-Za-z0-9_-]{24,}$/.test(segment)) return ':token';
      return segment;
    })
    .join('/');
  return `${method} ${path}`;
}

// Forme d'une valeur : une entrée « chemin → type » par valeur rencontrée.
// Les éléments d'un tableau partagent le chemin `…[]` ; un tableau vide ne dit
// rien de ses éléments.
export function shapeEntries(value: unknown, path = '$', out: Array<[string, string]> = []): Array<[string, string]> {
  if (value === null) {
    out.push([path, 'null']);
  } else if (Array.isArray(value)) {
    out.push([path, 'array']);
    for (const item of value) shapeEntries(item, `${path}[]`, out);
  } else if (typeof value === 'object') {
    out.push([path, 'object']);
    for (const [key, item] of Object.entries(value)) shapeEntries(item, `${path}.${key}`, out);
  } else {
    out.push([path, typeof value]);
  }
  return out;
}

export function recordApiShape(method: string, url: string, status: number, body: string | undefined): void {
  if (!OUTPUT_DIR || body === undefined || status < 200 || status >= 300) return;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return;
  }
  const route = routeKey(method, url);
  const lines = shapeEntries(value)
    .map(([path, type]) => JSON.stringify([route, path, type]))
    .filter((line) => !written.has(line));
  if (!lines.length) return;
  for (const line of lines) written.add(line);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  appendFileSync(join(OUTPUT_DIR, `shapes-${process.pid}.jsonl`), `${lines.join('\n')}\n`);
}
