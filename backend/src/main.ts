import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
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

  // Les images sont envoyées en data URI (transition avant le stockage objet) —
  // le plafond Express par défaut (100 kb) ne suffit pas. Cf. artifact §08.
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));

  app.enableCors({
    origin: true, // à restreindre au domaine du frontend en prod
    credentials: true,
  });

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
}
bootstrap();
