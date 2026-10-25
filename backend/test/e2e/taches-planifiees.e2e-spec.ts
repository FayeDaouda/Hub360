import { INestApplication, Logger } from '@nestjs/common';
import { CommissionsService } from '../../src/crm/commissions.service';
import { RappelsService } from '../../src/notifications/rappels.service';
import { RelancesCeoService } from '../../src/pilotage/relances-ceo.service';
import { SyntheseService } from '../../src/pilotage/synthese.service';
import { demarrer } from './app';

// Tâches planifiées, lancées comme le planificateur le fait : hors de toute
// requête. Avec le refus par défaut (ADR 0001), chacune doit déclarer son
// contexte, sinon ses lectures de données de société échouent. Elles
// rattrapent leurs erreurs et les journalisent : aucune ne doit en produire.
describe('Tâches planifiées', () => {
  let app: INestApplication;
  let erreurs: jest.SpyInstance;

  beforeAll(async () => {
    app = await demarrer();
    erreurs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(async () => {
    erreurs.mockRestore();
    await app.close();
  });
  afterEach(() => erreurs.mockClear());

  it.each([
    ['rappels quotidiens', () => app.get(RappelsService).tournee()],
    ['commissions des apporteurs', () => app.get(CommissionsService).tournee()],
    ['synthèses mensuelles', () => app.get(SyntheseService).synchroniser()],
    ['relances du CEO', () => app.get(RelancesCeoService).tournee()],
  ])('%s : s’exécute sans erreur hors requête', async (_tache, lancer) => {
    await expect(lancer()).resolves.not.toThrow();
    expect(erreurs.mock.calls.map((c) => String(c[0]))).toEqual([]);
  });
});
