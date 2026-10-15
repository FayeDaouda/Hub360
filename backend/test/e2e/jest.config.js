/**
 * Tests de bout en bout (HTTP réel) des parcours critiques : le vrai serveur
 * NestJS sur une base PostgreSQL DÉDIÉE (hub_e2e), créée, migrée et remplie
 * des données de démo à chaque lancement, puis supprimée.
 *
 *   npm run test:e2e
 */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.json' }],
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/base-de-test.ts',
  globalTeardown: '<rootDir>/fin-de-test.ts',
  testTimeout: 60_000,
};
