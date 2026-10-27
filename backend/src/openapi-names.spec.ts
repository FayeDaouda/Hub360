import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Le contrat OpenAPI nomme chaque schéma d'après sa classe : deux classes
// `…Dto` du même nom, dans deux modules, s'écrasent en silence (le second
// remplace le premier, et une route décrit alors la mauvaise forme). Vu en
// S3e (ProjectCellDto d'Équipes et des projets ouverts).
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('noms des DTO (contrat OpenAPI)', () => {
  it('aucune classe …Dto ne porte le nom d’une autre', () => {
    const places = new Map<string, string[]>();
    for (const file of tsFiles(__dirname)) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/^(?:export )?class (\w+Dto)\b/gm)) {
        places.set(name, [...(places.get(name) ?? []), file.slice(__dirname.length + 1)]);
      }
    }
    const duplicates = [...places].filter(([, files]) => files.length > 1);
    expect(duplicates).toEqual([]);
  });
});
