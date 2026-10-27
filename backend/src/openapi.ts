// Écrit la description OpenAPI (backend/openapi.json), sans base de données :
// en mode « aperçu », Nest assemble les modules sans créer les services, donc
// ni connexion ni tâche planifiée. La CI la régénère et échoue si le fichier
// versionné diffère.
//   npm run build && npm run openapi
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AppModule } from './app.module';
import { PREFIXE_API, documentOpenApi } from './documentation';

async function generer(fichier: string) {
  const app = await NestFactory.create(AppModule, { preview: true, logger: ['error', 'warn'] });
  app.setGlobalPrefix(PREFIXE_API);
  writeFileSync(fichier, `${JSON.stringify(documentOpenApi(app), null, 2)}\n`);
  await app.close();
}

void generer(process.argv[2] ?? 'openapi.json');
