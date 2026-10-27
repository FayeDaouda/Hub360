import { EmailService } from '../email/email.service';
import { ErrorReporter } from './error-reporter.service';

// Suivi des erreurs : une ligne JSON par erreur dans les journaux, et au plus
// un e-mail d'alerte par quart d'heure quand ALERTES_EMAIL est renseignée.
describe('ErrorReporter', () => {
  const erreur = { source: 'api' as const, route: '/api/societes/:slug/factures', method: 'POST', status: 500 };
  let email: { envoyerAlerte: jest.Mock };
  let ecrit: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-27T10:00:00Z') });
    email = { envoyerAlerte: jest.fn().mockResolvedValue({ envoye: true }) };
    ecrit = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    jest.useRealTimers();
    ecrit.mockRestore();
    delete process.env.ALERTES_EMAIL;
  });

  const reporter = () => new ErrorReporter(email as unknown as EmailService);

  it('écrit une ligne JSON reconnaissable par erreur', () => {
    reporter().report({ ...erreur, message: 'panne', stack: 'Error: panne\n    at x' });
    const ligne = JSON.parse(String(ecrit.mock.calls[0][0]));
    expect(ligne).toMatchObject({ suivi: 'erreur', source: 'api', route: erreur.route, statut: 500, message: 'panne' });
    expect(ligne.pile).toContain('at x');
  });

  it('sans ALERTES_EMAIL : aucun e-mail', async () => {
    const r = reporter();
    r.report({ ...erreur, message: 'panne' });
    await jest.runAllTimersAsync();
    expect(email.envoyerAlerte).not.toHaveBeenCalled();
  });

  it('première erreur alertée tout de suite, les suivantes regroupées un quart d’heure plus tard', async () => {
    process.env.ALERTES_EMAIL = 'cio@exemple.sn';
    const r = reporter();
    r.report({ ...erreur, message: 'première' });
    await jest.advanceTimersByTimeAsync(0);
    expect(email.envoyerAlerte).toHaveBeenCalledTimes(1);
    expect(email.envoyerAlerte.mock.calls[0][0]).toMatchObject({
      email: 'cio@exemple.sn',
      sujet: '[HUB] 1 erreur en production',
    });

    r.report({ ...erreur, message: 'deuxième' });
    r.report({ ...erreur, message: 'troisième' });
    await jest.advanceTimersByTimeAsync(14 * 60_000);
    expect(email.envoyerAlerte).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(email.envoyerAlerte).toHaveBeenCalledTimes(2);
    const { sujet, texte } = email.envoyerAlerte.mock.calls[1][0];
    expect(sujet).toBe('[HUB] 2 erreurs en production');
    expect(texte).toContain('deuxième');
    expect(texte).toContain('troisième');
    expect(texte).toContain('27/10/2026 10:'); // heure de Dakar (UTC+0)
  });

  it('au-delà de 20 erreurs, les suivantes sont seulement comptées', async () => {
    process.env.ALERTES_EMAIL = 'cio@exemple.sn';
    const r = reporter();
    for (let i = 0; i < 25; i++) r.report({ ...erreur, message: `erreur ${i}` });
    await jest.advanceTimersByTimeAsync(0);
    const { sujet, texte } = email.envoyerAlerte.mock.calls[0][0];
    expect(sujet).toBe('[HUB] 25 erreurs en production');
    expect(texte).toContain('erreur 19');
    expect(texte).not.toContain('erreur 20');
    expect(texte).toContain('… et 5 de plus, dans les journaux du serveur.');
  });
});
