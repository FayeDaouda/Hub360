import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { ALL_KEYS, envOf, keyTag } from './support/screens';

// Tourne contre les environnements de référence isolés
// (scripts/reference-env.sh), jamais contre les serveurs de développement.
//
// Visiter un écran change l'état du serveur (accusés de lecture, journal) :
// l'ordre des visites doit être le même d'un run à l'autre. Chaque
// environnement (sa base, ses serveurs) est parcouru par un seul processus,
// dans un ordre fixe : projet « captures-i » = environnement i = les écrans
// dont la clé stable tombe sur i (support/screens.ts). Les processus
// travaillent en parallèle, un par environnement.
const envsFile = join(__dirname, '.state', 'envs.json');
const ENVS = existsSync(envsFile) ? (JSON.parse(readFileSync(envsFile, 'utf8')) as { count: number }).count : 1;
const frontURL = (i: number) => `http://localhost:${3100 + 10 * i}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export type CaptureOptions = { envIndex: number };

export default defineConfig<CaptureOptions>({
  outputDir: '.state/test-results',
  // Les noms de capture portent le dossier (visual-desktop/, visual-mobile/,
  // visual-glass/) : mêmes chemins qu'avant la répartition.
  snapshotPathTemplate: '.reference/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: '.state/report', open: 'never' }]],
  timeout: 120_000,
  workers: ENVS,
  fullyParallel: false,
  use: {
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
  },
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  projects: [
    ...Array.from({ length: ENVS }, (_, i) => ({
      name: `captures-${i}`,
      testDir: './visual',
      grep: new RegExp(
        ALL_KEYS.filter((key) => envOf(key, ENVS) === i)
          .map((key) => escape(keyTag(key)))
          .join('|') || '^$',
      ),
      use: { baseURL: frontURL(i), envIndex: i },
    })),
    // Les tests de fumée changent les données : environnement 0, un processus,
    // dans l'ordre du fichier.
    {
      name: 'smoke',
      testDir: './smoke',
      outputDir: '.state/test-results-smoke',
      fullyParallel: false,
      use: { baseURL: frontURL(0), envIndex: 0, viewport: { width: 1440, height: 900 } },
    },
  ],
});
