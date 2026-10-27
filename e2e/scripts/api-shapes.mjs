// Compare la forme des réponses de l'API relevée sur la référence (main) et
// sur la branche (support/api-shapes.ts) :
//   node scripts/api-shapes.mjs <relevé de référence> <relevé de la branche>
// Échec (code 1) si, sur une route appelée des deux côtés, une clé de la
// référence a disparu ou si son type a changé. Une clé ajoutée est seulement
// signalée ; une route que la branche n'a pas appelée aussi (rien à comparer).
// Un tableau vide d'un côté ne dit rien de ses éléments : pas comparé.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [referenceDir, comparedDir] = process.argv.slice(2);
if (!referenceDir || !comparedDir) {
  console.error('Usage : node scripts/api-shapes.mjs <relevé de référence> <relevé de la branche>');
  process.exit(2);
}

// route → chemin → types vus
function load(dir) {
  const routes = new Map();
  if (!existsSync(dir)) return routes;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!line) continue;
      const [route, path, type] = JSON.parse(line);
      if (!routes.has(route)) routes.set(route, new Map());
      const paths = routes.get(route);
      if (!paths.has(path)) paths.set(path, new Set());
      paths.get(path).add(type);
    }
  }
  return routes;
}

// Le chemin traverse-t-il un tableau dont aucun élément n'a été vu ?
function underEmptyArray(paths, path) {
  let index = path.indexOf('[]');
  while (index !== -1) {
    const element = path.slice(0, index + 2);
    if (![...paths.keys()].some((p) => p === element || p.startsWith(`${element}.`) || p.startsWith(`${element}[]`)))
      return true;
    index = path.indexOf('[]', index + 2);
  }
  return false;
}

const reference = load(referenceDir);
const compared = load(comparedDir);
if (reference.size === 0) {
  console.error(`✗ aucun relevé de référence dans ${referenceDir}`);
  process.exit(1);
}

const failures = [];
const additions = [];
const notCalled = [];
let checkedPaths = 0;
for (const [route, refPaths] of reference) {
  const paths = compared.get(route);
  if (!paths) {
    notCalled.push(route);
    continue;
  }
  for (const [path, refTypes] of refPaths) {
    if (underEmptyArray(refPaths, path) || underEmptyArray(paths, path)) continue;
    checkedPaths++;
    const types = paths.get(path);
    if (!types) {
      failures.push(`${route}  ${path} : disparue`);
      continue;
    }
    // null est compatible avec tout : seules les valeurs non nulles comptent.
    const refConcrete = [...refTypes].filter((t) => t !== 'null');
    const concrete = [...types].filter((t) => t !== 'null');
    if (refConcrete.length && concrete.length && !refConcrete.some((t) => concrete.includes(t))) {
      failures.push(`${route}  ${path} : ${refConcrete.join('|')} → ${concrete.join('|')}`);
    }
  }
  for (const path of paths.keys()) if (!refPaths.has(path)) additions.push(`${route}  ${path}`);
}

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
console.log(
  `Forme des réponses de l'API : ${plural(reference.size, 'route relevée', 'routes relevées')} sur la référence, ` +
    `${plural(reference.size - notCalled.length, 'comparée', 'comparées')}, ` +
    `${plural(checkedPaths, 'clé vérifiée', 'clés vérifiées')}.`,
);
if (notCalled.length) console.log(`  routes non appelées par la branche (non comparées) : ${notCalled.length}`);
if (additions.length) {
  console.log(`  clés ajoutées (sans effet sur le front) : ${additions.length}`);
  for (const a of additions.slice(0, 20)) console.log(`    + ${a}`);
}
if (failures.length) {
  const n = failures.length;
  console.log(`✗ ${n} ${n > 1 ? 'clés disparues ou de type changé' : 'clé disparue ou de type changé'} :`);
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
console.log('✓ aucune clé disparue ni de type changé');
