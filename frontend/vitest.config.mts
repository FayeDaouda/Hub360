import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires du front, co-localisés comme au back (`*.spec.ts` à côté du
// fichier testé). L'alias « @/ » est celui de tsconfig.json.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['**/*.spec.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
