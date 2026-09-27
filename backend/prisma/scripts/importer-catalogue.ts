import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { CatalogueSource, importerCatalogue } from '../catalogue';

// Importe / resynchronise le catalogue réel d'une société sur une base
// existante (le seed le fait déjà pour une base neuve).
//   npm run catalogue:importer                 → grey-concrete
//   npm run catalogue:importer -- <slug>

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] ?? 'grey-concrete';
  const societe = await prisma.societe.findUnique({ where: { slug } });
  if (!societe) throw new Error(`Société introuvable : ${slug}`);
  const source = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'catalogue-grey-concrete.json'), 'utf8'),
  ) as CatalogueSource;
  const { importes, ignorees } = await importerCatalogue(prisma, societe.id, source);
  console.log(`${importes.length} produit(s) importé(s) pour ${slug} : ${importes.join(', ')}`);
  if (ignorees.length) console.log(`Familles hors devis (ET : refacturation depuis Études) : ${ignorees.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
