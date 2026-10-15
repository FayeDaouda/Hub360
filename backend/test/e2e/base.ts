import { readFileSync } from 'fs';
import { join } from 'path';

// Base dédiée aux tests de bout en bout : même serveur que DATABASE_URL (ou
// E2E_DATABASE_URL), autre base. Jamais la base de développement.
export const NOM_BASE_E2E = 'hub_e2e';

export function urlBaseE2e(): string {
  const explicite = process.env.E2E_DATABASE_URL;
  if (explicite) return explicite;
  const env = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
  const source = /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)?.[1];
  if (!source) throw new Error('DATABASE_URL introuvable dans backend/.env (ou définir E2E_DATABASE_URL).');
  const url = new URL(source);
  url.pathname = `/${NOM_BASE_E2E}`;
  return url.toString();
}

// URL de la base d'administration du serveur (pour créer / supprimer la base de test).
export function urlAdministration(urlE2e: string): string {
  const url = new URL(urlE2e);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}
