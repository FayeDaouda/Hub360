import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Refuse de démarrer en prod avec le secret par défaut — la pire des
  // surprises est un JWT signé par une valeur publiquement connue.
  if (process.env.NODE_ENV === 'production') {
    const s = process.env.JWT_SECRET;
    if (!s || s === 'change-moi-en-production' || s.length < 32) {
      throw new Error(
        'JWT_SECRET doit être une valeur aléatoire d’au moins 32 octets en production.',
      );
    }
  }

  const app = await NestFactory.create(AppModule);

  // En-têtes de sécurité HTTP standards (X-Content-Type-Options, X-Frame-Options,
  // HSTS en HTTPS, CSP…). API JSON pure : les défauts conviennent.
  app.use(helmet());

  // Les images sont envoyées en data URI (transition avant le stockage objet) —
  // le plafond Express par défaut (100 kb) ne suffit pas. Cf. artifact §08.
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));

  // CORS : liste blanche explicite (jamais « toutes origines » avec credentials).
  // CORS_ORIGINS (séparées par des virgules) sinon FRONT_URL sinon localhost.
  const origines = (
    process.env.CORS_ORIGINS ||
    process.env.FRONT_URL ||
    'http://localhost:3000'
  )
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

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`HUB API démarrée sur http://localhost:${port}/api`);
  console.log(`CORS autorisé pour : ${origines.join(', ')}`);
}
bootstrap();
