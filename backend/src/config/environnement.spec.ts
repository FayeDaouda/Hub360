import { problemesEnvironnement, SECRET_JWT_PAR_DEFAUT } from './environnement';

const BASE = { DATABASE_URL: 'postgresql://hub:hub@localhost:5432/hub?schema=public' };
const SECRET_SOLIDE = 'x'.repeat(48);

describe('problemesEnvironnement', () => {
  it('ACCEPTÉ : développement minimal (secret JWT par défaut toléré hors production)', () => {
    expect(problemesEnvironnement({ ...BASE })).toEqual([]);
  });

  it('ACCEPTÉ : production complète', () => {
    expect(
      problemesEnvironnement({
        ...BASE,
        NODE_ENV: 'production',
        JWT_SECRET: SECRET_SOLIDE,
        PORT: '3001',
        FRONT_URL: 'https://hub.group',
        EMAIL_TRANSPORT: 'SMTP',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        HUB_RELAIS: '1',
      }),
    ).toEqual([]);
  });

  it('une variable vide vaut une variable absente', () => {
    expect(problemesEnvironnement({ ...BASE, SMTP_HOST: '', SMTP_SECURE: '', PORT: '' })).toEqual([]);
  });

  it('REFUSÉ : DATABASE_URL absente ou non PostgreSQL', () => {
    expect(problemesEnvironnement({})).toHaveLength(1);
    expect(problemesEnvironnement({ DATABASE_URL: 'mysql://x' })[0]).toContain('DATABASE_URL');
  });

  it.each([
    ['absent', undefined],
    ['par défaut', SECRET_JWT_PAR_DEFAUT],
    ['trop court', 'court'],
  ])('REFUSÉ en production : JWT_SECRET %s', (_cas, secret) => {
    expect(problemesEnvironnement({ ...BASE, NODE_ENV: 'production', JWT_SECRET: secret })[0]).toContain('JWT_SECRET');
  });

  it.each([
    ['PORT', 'abc'],
    ['EMAIL_TRANSPORT', 'pigeon'],
    ['SMTP_SECURE', 'oui'],
    ['HUB_DOUBLE_FACTEUR', 'facultatif'],
    ['HUB_DONNEES_DEMO', 'oui'],
    ['JWT_EXPIRES_IN', 'une semaine'],
    ['NODE_ENV', 'staging'],
  ])('REFUSÉ : %s = %s', (variable, valeur) => {
    expect(problemesEnvironnement({ ...BASE, [variable]: valeur })).toEqual(expect.arrayContaining([expect.stringContaining(variable)]));
  });
});
