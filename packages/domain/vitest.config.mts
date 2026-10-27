import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Fuseau de l'appareil volontairement loin de Dakar (UTC+14) : un affichage
    // qui en dépendrait encore ferait échouer son test.
    env: { TZ: 'Pacific/Kiritimati' },
  },
});
