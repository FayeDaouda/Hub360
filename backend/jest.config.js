/**
 * Tests unitaires backend (Jest + ts-jest).
 *
 * Convention : test co-localisé `*.spec.ts` à côté du fichier testé, sous
 * `src/`. Les tests d'intégration HTTP (`*.e2e-spec.ts`) viendront dans un
 * projet Jest séparé avec une base dédiée.
 */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!**/*.dto.ts', '!**/dto.ts', '!main.ts'],
  coverageDirectory: '../coverage',
};
