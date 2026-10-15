import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';
import { NOM_BASE_E2E, urlAdministration, urlBaseE2e } from './base';

// Avant tous les tests : base hub_e2e recréée de zéro, migrée, données de démo.
export default async function () {
  const url = urlBaseE2e();
  if (!new URL(url).pathname.endsWith(NOM_BASE_E2E)) throw new Error(`Base de test attendue : ${NOM_BASE_E2E}.`);
  const admin = new PrismaClient({ datasources: { db: { url: urlAdministration(url) } } });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NOM_BASE_E2E} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${NOM_BASE_E2E}`);
  } finally {
    await admin.$disconnect();
  }
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  const racine = join(__dirname, '..', '..');
  execSync('npx prisma migrate deploy', { cwd: racine, env, stdio: 'ignore' });
  execSync('npx ts-node prisma/seed.ts', { cwd: racine, env, stdio: 'ignore' });
  // Hérité par les fichiers de test (même processus avec --runInBand).
  process.env.DATABASE_URL = url;
}
