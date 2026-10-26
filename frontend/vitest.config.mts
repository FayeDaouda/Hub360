import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires du front, co-localisés comme au back (`*.spec.ts` à côté du
// fichier testé). L'alias « @/ » est celui de tsconfig.json. Les tests de
// composants (`*.spec.tsx`) tournent dans un DOM simulé (jsdom).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      { extends: true, test: { name: 'unit', include: ['**/*.spec.ts'], environment: 'node' } },
      { extends: true, test: { name: 'components', include: ['**/*.spec.tsx'], environment: 'jsdom' } },
    ],
  },
});
