import { PrismaClient } from '@prisma/client';
import { NOM_BASE_E2E, urlAdministration, urlBaseE2e } from './base';

export default async function () {
  if (process.env.E2E_GARDER_BASE) return; // inspection après un échec
  const admin = new PrismaClient({ datasources: { db: { url: urlAdministration(urlBaseE2e()) } } });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NOM_BASE_E2E} WITH (FORCE)`);
  } finally {
    await admin.$disconnect();
  }
}
