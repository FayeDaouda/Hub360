import './config/charger';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PREFIXE_API, documentOpenApi } from './documentation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // En production, l'API est derrière un seul relais (Caddy, deploy/) : sans
  // cette confiance, chaque requête paraît venir du relais, et toute la société
  // partagerait la limite de 5 connexions par minute (bilan avant déploiement,
  // 22/10/2026). Hors production, pas de relais : l'en-tête n'est pas cru.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', Number(process.env.HUB_RELAIS || 1));

  // En-têtes de sécurité HTTP standards (X-Content-Type-Options, X-Frame-Options,
  // HSTS en HTTPS, CSP…). API JSON pure : les défauts conviennent.
  app.use(helmet());

  // Les images sont envoyées en data URI (transition avant le stockage objet) —
  // le plafond Express par défaut (100 kb) ne suffit pas. Cf. artifact §08.
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));

  // CORS : liste blanche explicite (jamais « toutes origines » avec credentials).
  // CORS_ORIGINS (séparées par des virgules) sinon FRONT_URL sinon localhost.
  const origines = (process.env.CORS_ORIGINS || process.env.FRONT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origines, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(PREFIXE_API);

  // Page Swagger de la description de l'API (/api/docs) : en développement
  // seulement, jamais en production (décision du 27/10/2026).
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup(`${PREFIXE_API}/docs`, app, documentOpenApi(app));
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`HUB API démarrée sur http://localhost:${port}/api`);
  console.log(`CORS autorisé pour : ${origines.join(', ')}`);
}
bootstrap();
